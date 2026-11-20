/* Estimate Pro — credits for the 3D models and pictures used in a drawing.
   Models and pictures taken from the web usually need the author's name and the licence shown wherever the picture is
   published (CC BY), so each one used in the drawing gets a row: author, source link, licence. Kept with the drawing
   (bim.credits) and remembered on this device, so the same file needs filling in only once. */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, B = EP.bim, U = EP.ui; if (!CAD || !B) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var LIC = ["", "Own work", "CC0 / public domain", "CC BY 4.0", "CC BY-SA 4.0", "Royalty-free (site licence)", "Purchased licence", "Other"], LSKEY = "ep_credits";
  function mem() { try { return JSON.parse(localStorage.getItem(LSKEY) || "{}") || {}; } catch (e) { return {}; } }
  function memSet(m) { try { localStorage.setItem(LSKEY, JSON.stringify(m)); } catch (e) {} }
  /* everything in the drawing that came from a file: [{ key, kind, name }] */
  B.creditItems = function (d) {
    var out = [], seen = {}, bs = d.bim || {}, add = function (key, kind, name) { if (seen[key]) return; seen[key] = 1; out.push({ key: key, kind: kind, name: name }); };
    d.ents.forEach(function (e) { if (e.t === "model3d") add("m:" + (e.name || e.asset), "3D model", e.name || "Model"); });
    Object.keys(bs.pics || {}).forEach(function (k) { var p = bs.pics[k]; add("p:" + (p.name || k), "Picture cut-out", p.name || "Picture"); });
    Object.keys(bs.texs || {}).forEach(function (k) { var t = bs.texs[k]; add("t:" + (t.name || k), "Material picture", t.name || "Material"); });
    if (bs.sky && bs.sky.kind === "pic" && bs.sky.src) add("sky", "Background picture", "Sky / background");
    return out;
  };
  B.creditOf = function (d, key) { var c = ((d.bim || {}).credits || {})[key]; return c || mem()[key] || {}; };
  B.creditsText = function (d) {
    var it = B.creditItems(d), L = []; if (!it.length) return "";
    it.forEach(function (x) { var c = B.creditOf(d, x.key), s = "• " + x.name + " (" + x.kind.toLowerCase() + ")"; if (c.by) s += " — by " + c.by; if (c.lic) s += " — " + c.lic; if (c.src) s += " — " + c.src; L.push(s); });
    return "Credits — " + (d.name || "drawing") + "\n" + L.join("\n");
  };
  /* rows that still need something before the pictures are published */
  B.creditGaps = function (d) { return B.creditItems(d).filter(function (x) { var c = B.creditOf(d, x.key); return !c.lic || (/^CC BY/.test(c.lic) && !c.by); }); };

  CAD.MENU_EXTRA = (CAD.MENU_EXTRA || []).concat([["-"], ["credits", "Credits for models and pictures…"]]);
  CAD.ACTIONS.credits = function (ed) {
    var d = ed.doc.d, it = B.creditItems(d);
    var rows = it.map(function (x, i) { var c = B.creditOf(d, x.key);
      return "<tr style='border-top:1px solid var(--line,#ddd)'><td style='padding:4px 6px 4px 0'><b>" + esc(x.name) + "</b><br><span class='muted small'>" + esc(x.kind) + "</span></td><td><input class='in small' style='width:100%;min-width:110px' data-crf='by' data-cri='" + i + "' value='" + esc(c.by || "") + "' placeholder='Author / maker' aria-label='Author of " + esc(x.name) + "'></td><td><input class='in small' style='width:100%;min-width:110px' data-crf='src' data-cri='" + i + "' value='" + esc(c.src || "") + "' placeholder='https://…' aria-label='Source link of " + esc(x.name) + "'></td><td><select class='in small' style='width:100%;min-width:120px' data-crf='lic' data-cri='" + i + "' aria-label='Licence of " + esc(x.name) + "'>" + LIC.map(function (l) { return "<option" + ((c.lic || "") === l ? " selected" : "") + " value='" + esc(l) + "'>" + (l || "— not recorded —") + "</option>"; }).join("") + "</select></td></tr>"; }).join("");
    var body = it.length ? "<p class='muted small' style='margin:0 0 6px'>Models and pictures from the web mostly ask for the author's name and the licence to be shown wherever you publish a picture or video of the design (CC BY). Fill in each row once — it is remembered on this device for the same file.</p><div style='max-height:46vh;overflow:auto'><table style='width:100%;border-collapse:collapse;font-size:13px'><thead><tr><th>Item</th><th>Author</th><th>Source link</th><th>Licence</th></tr></thead><tbody>" + rows + "</tbody></table></div><p class='muted small cr-gap' style='margin:6px 0 0'></p>"
      : "<p class='muted' style='margin:0 0 6px'>This drawing uses no imported 3D models, picture cut-outs, material pictures or background picture, so there is nothing to credit.</p>";
    var dlg = CAD.ui.dialog("<h3>Credits for models and pictures</h3>" + body + "<p class='muted small' style='margin:6px 0'>Parts of the app itself: <a href='credits.html' target='_blank' rel='noopener'>open the Credits page</a>.</p><div class='row' style='gap:8px;justify-content:flex-end;flex-wrap:wrap'><button type='button' class='btn ghost sm' data-dlg='close'>Close</button>" + (it.length ? "<button type='button' class='btn sec sm' data-crcopy='1'>Copy credits text</button><button type='button' class='btn pri sm' data-crsave='1'>Save</button>" : "") + "</div>",
      function (b, dl) {
        if (!b.dataset.crsave && !b.dataset.crcopy) return;
        var cr = Object.assign({}, (B.ensure(ed.doc.d).credits) || {}), m = mem();
        dl.querySelectorAll("[data-crf]").forEach(function (el) { var x = it[+el.dataset.cri]; if (!x) return; var o = cr[x.key] = Object.assign({}, cr[x.key] || {}); o[el.dataset.crf] = el.value.trim().slice(0, 300); });
        Object.keys(cr).forEach(function (k) { var o = cr[k]; if (!o.by && !o.src && !o.lic) delete cr[k]; else m[k] = o; }); memSet(m);
        var nb = CAD.clone(B.ensure(ed.doc.d)); nb.credits = cr; ed.doc.begin("Credits"); ed.doc.set("bim", nb); ed.doc.commit(); gaps(dl);
        if (b.dataset.crcopy) { var txt = B.creditsText(ed.doc.d); var done = function () { U.toast("Credits text copied — paste it under your picture, in the video description or on the drawing."); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt("Copy the credits text:", txt); }); else window.prompt("Copy the credits text:", txt); }
        else U.toast("Credits saved with the drawing.");
      });
    function gaps(dl) { var el = dl.querySelector(".cr-gap"); if (!el) return; var g = B.creditGaps(ed.doc.d); el.textContent = g.length ? "Still to fill in before publishing: " + g.map(function (x) { return x.name; }).join(", ") + " (licence, and the author's name for CC BY)." : "All items have a licence recorded."; }
    gaps(dlg);
  };
})();
