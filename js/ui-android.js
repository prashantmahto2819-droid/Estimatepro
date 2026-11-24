/* Estimate Pro Android app (android/): the page runs in the app's own WebView, which cannot save a download made in the
   page, share files or print by itself. The app adds window.EPAndroid; this file hands those jobs to it.
   In a browser (no EPAndroid) it does nothing. Loaded before the other app scripts. */
(function () {
  var A = window.EPAndroid; if (!A) return;
  window.EP_ANDROID = true;
  function b64(blob) {
    return new Promise(function (res, rej) { var f = new FileReader(); f.onload = function () { var s = String(f.result); res(s.slice(s.indexOf(",") + 1)); }; f.onerror = rej; f.readAsDataURL(blob); });
  }
  function saveUrl(href, name) {
    return fetch(href).then(function (r) { return r.blob(); })
      .then(function (b) { return b64(b).then(function (d) { A.save(name || "download", b.type || "", d); }); })
      .catch(function () { alert("Could not save " + (name || "the file") + "."); });
  }
  /* downloads made with <a download href="blob:…"> (Excel, PDF, DXF, photos, backups) */
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download") && /^(blob|data):/i.test(this.href)) { saveUrl(this.href, this.getAttribute("download")); return; }
    return click.apply(this, arguments);
  };
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[download]");
    if (a && /^(blob|data):/i.test(a.href)) { e.preventDefault(); saveUrl(a.href, a.getAttribute("download")); }
  }, true);
  /* Web Share (files + text) → the phone's share sheet */
  navigator.canShare = function (d) { return !!d; };
  navigator.share = function (d) {
    d = d || {}; var fs = Array.prototype.slice.call(d.files || []);
    return Promise.all(fs.map(function (f) { return b64(f).then(function (x) { return { name: f.name || "file", type: f.type || "", b64: x }; }); }))
      .then(function (list) { A.share(JSON.stringify({ title: d.title || "", text: d.text || "", url: d.url || "", files: list })); });
  };
  /* printing: the page itself, and windows it opens for print previews */
  window.print = function () { A.printPage(document.title || "Estimate Pro"); };
  var open = window.open;
  window.open = function (url) {
    var w = open.apply(window, arguments);
    if (w && (!url || url === "about:blank")) {
      var hook = function () { try { w.print = function () { A.printPopup(); }; } catch (e) { /* the app's Print button still works */ } };
      hook(); setTimeout(hook, 0); setTimeout(hook, 400);
    }
    return w;
  };
})();
