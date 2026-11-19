/* Estimate Pro — Hindi guided tutorials (in-app walkthrough).
   Step-by-step interactive tour for each major feature.
   Shows a tooltip that highlights a UI element and explains what to do. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;

  var running = null, step = 0;

  var TOURS = {
    estimate: {
      title: "Estimate बनाना सीखें",
      titleEn: "Learn to create an Estimate",
      steps: [
        { el: "[data-nav='est']", text: "यहाँ 'Estimates' पर क्लिक करें — यह आपके सारे एस्टिमेट दिखाता है।", en: "Click 'Estimates' — this shows all your estimates." },
        { el: "#est-new, [data-action='new-est']", text: "'New estimate' बटन दबाएँ — नया एस्टिमेट बनेगा।", en: "Click 'New estimate' to create one." },
        { el: "#est-name, input[name='name']", text: "एस्टिमेट का नाम लिखें, जैसे: '2 कमरे का सेट — गेवरा'", en: "Type the estimate name, e.g., '2 Room Set — Gevra'" },
        { el: "#est-add-row, [data-action='add-item']", text: "'Add item' पर क्लिक करके एक-एक मद (item) जोड़ें।", en: "Click 'Add item' to add line items one by one." },
        { el: ".est-desc, input[name='desc']", text: "काम का विवरण लिखें — जैसे: 'Earthwork in excavation for foundation'", en: "Describe the work — e.g., 'Earthwork in excavation for foundation'" },
        { el: ".est-dim, input[name='l']", text: "माप भरें: L (लंबाई), B (चौड़ाई), D/H (गहराई/ऊँचाई) और No (नग)।", en: "Enter dimensions: L (length), B (breadth), D/H (depth/height), No (number)." },
        { el: ".est-rate, input[name='rate']", text: "दर (rate) भरें — SOR / DSR / अपनी दर। Qty अपने-आप बन जाएगी।", en: "Enter the rate from SOR / DSR / your own. Qty calculates automatically." },
        { el: "#est-save, [data-action='save']", text: "Save करें! एस्टिमेट ऑटो-सेव भी होता है, और ऑफलाइन भी काम करता है।", en: "Save! Estimates also auto-save and work offline." }
      ]
    },
    camera: {
      title: "GPS Camera इस्तेमाल करें",
      titleEn: "Use the GPS Camera",
      steps: [
        { el: "[data-camopen], .cam-btn", text: "'GPS Camera' बटन दबाएँ — कैमरा खुलेगा।", en: "Tap 'GPS Camera' to open it." },
        { el: "#gcam-site", text: "Site का नाम लिखें — जैसे 'गेवरा OB Dump Ch.120'।\nयह हर फ़ोटो पर छपेगा।", en: "Type the site name — it appears on every photo." },
        { el: "#gcam-note", text: "फ़ोटो का नोट लिखें — जैसे 'Left side drain Ch.120 m'।", en: "Type a note for the photo." },
        { el: "#gcam-st", text: "GPS accuracy देखें: हरा ≤20m (अच्छा), पीला ≤60m (ठीक), लाल >60m (कमज़ोर)।\nखुले आसमान में जाएँ।", en: "Check GPS accuracy. Go to open sky for best results." },
        { el: "#gcam-shoot, .gcam-shoot", text: "शूट बटन दबाएँ — फ़ोटो खिंचेगी, जगह/समय/GPS अपने-आप छप जाएगा।", en: "Tap the shutter button to take a stamped photo." },
        { el: "#gcam-keep", text: "'Save photo' दबाएँ — फ़ोटो फ़ोन पर सेव हो जाएगी, नेटवर्क आने पर ऑनलाइन भी।", en: "Tap 'Save photo' to keep it on the phone and sync later." },
        { el: "[data-nav='photos']", text: "'GPS Photos' में जाकर अपनी सारी फ़ोटो देखें, डाउनलोड करें, या Photo Sheet प्रिंट करें।", en: "Go to 'GPS Photos' to view, download, or print a photo sheet." }
      ]
    },
    cad: {
      title: "CAD Drawing बनाना",
      titleEn: "Create a CAD Drawing",
      steps: [
        { el: "[data-nav='cad']", text: "'CAD' पर क्लिक करें — ड्राइंग एरिया खुलेगा।", en: "Click 'CAD' to open the drawing area." },
        { el: "[data-cmd='LINE'], .cad-ribbon [title*='Line']", text: "'Line' टूल चुनें — माउस/टच से पॉइंट क्लिक करके लाइन खींचें।\nEnter या दो बार क्लिक करके पूरा करें।", en: "Select 'Line' and click points to draw. Enter or double-click to finish." },
        { el: "[data-cmd='RECT'], .cad-ribbon [title*='Rect']", text: "'Rectangle' — दो कोने क्लिक करें, कमरे/दीवार बन जाएँगे।", en: "Select 'Rectangle' — click two corners." },
        { el: "[data-cmd='DIM'], .cad-ribbon [title*='Dim']", text: "'Dimension' — दो पॉइंट चुनें, माप (measurement) अपने-आप लिखा जाएगा।", en: "Select 'Dimension' — click two points to add measurement." },
        { el: "[data-cmd='SLAB'], .cad-ribbon [title*='Slab']", text: "BIM टूल: 'Slab', 'Wall', 'Beam' — 3D बिल्डिंग बनाएँ और quantity अपने-आप निकालें।", en: "BIM tools: Slab, Wall, Beam — build 3D and get auto quantities." },
        { el: "[data-cmd='3D'], .cad-3d", text: "'3D View' खोलें — अपनी बिल्डिंग को घुमा-घुमाकर देखें, render करें।", en: "Open '3D View' to rotate and render your building." }
      ]
    },
    bim: {
      title: "BIM & Quantity निकालना",
      titleEn: "BIM & Quantity Takeoff",
      steps: [
        { el: "[data-cmd='WALL']", text: "'Wall' कमांड — दो पॉइंट क्लिक करें, दीवार बनेगी।\n'H' बटन से ऊँचाई, 'T' से मोटाई बदलें।", en: "Wall command — click two points. Press H for height, T for thickness." },
        { el: "[data-cmd='SLAB']", text: "'Slab' — कमरे का polyline चुनें या बनाएँ, slab डल जाएगा।", en: "Slab — select a room polyline, the slab is placed." },
        { el: "[data-cmd='STAIR']", text: "'Stair' — शुरू और अंत पॉइंट दें, ऊँचाई दें, सीढ़ी बनेगी।", en: "Stair — give start, end and height." },
        { el: "[data-cmd='QTY'], .cad-ribbon [title*='Quantity']", text: "'Quantity' — सारे elements की मात्रा/माप की सूची (schedule) अपने-आप बनती है।\nइसे directly estimate में भेज सकते हैं।", en: "Quantity — generates a schedule from all elements. Send it directly to an estimate." },
        { el: "[data-cmd='EXPORT'], .cad-ribbon [title*='Export']", text: "'Export' — IFC, GLB या OBJ फ़ाइल बनाएँ।\nIFC फ़ाइल Revit / BIMcollab में खुलती है।", en: "Export to IFC (opens in Revit/BIMcollab), GLB or OBJ." }
      ]
    }
  };

  /* ---------- tooltip rendering ---------- */
  function showStep() {
    removeTooltip();
    if (!running || step >= running.steps.length) { finish(); return; }
    var s = running.steps[step], el = null;
    try { el = document.querySelector(s.el); } catch (e) {}

    var tip = document.createElement("div");
    tip.id = "tut-tip"; tip.className = "tut-tip";
    tip.innerHTML = "<div class='tut-body'><p>" + esc(s.text) + "</p><p class='muted' style='font-size:12px;margin-top:4px'>" + esc(s.en) + "</p></div>" +
      "<div class='tut-nav'><span class='muted'>" + (step + 1) + " / " + running.steps.length + "</span><div style='display:flex;gap:6px'>" +
      (step > 0 ? "<button type='button' class='btn ghost sm' id='tut-prev'>← Back</button>" : "") +
      "<button type='button' class='btn ghost sm' id='tut-skip'>Skip · छोड़ें</button>" +
      "<button type='button' class='btn pri sm' id='tut-next'>" + (step < running.steps.length - 1 ? "Next → अगला" : "Done ✓ पूरा") + "</button></div></div>";

    document.body.appendChild(tip);

    /* position near the element */
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      var r = el.getBoundingClientRect();
      /* highlight */
      el.classList.add("tut-hl");
      tip.style.top = Math.min(r.bottom + 12, window.innerHeight - tip.offsetHeight - 10) + "px";
      tip.style.left = Math.max(10, Math.min(r.left, window.innerWidth - tip.offsetWidth - 10)) + "px";
    } else {
      tip.style.top = "50%"; tip.style.left = "50%"; tip.style.transform = "translate(-50%, -50%)";
    }
  }

  function removeTooltip() {
    var old = document.getElementById("tut-tip"); if (old) old.remove();
    document.querySelectorAll(".tut-hl").forEach(function (el) { el.classList.remove("tut-hl"); });
  }

  function finish() { running = null; step = 0; removeTooltip(); removeOverlay(); U.toast("Tutorial complete! · ट्यूटोरियल पूरा हुआ!"); }

  function removeOverlay() { var o = document.getElementById("tut-overlay"); if (o) o.remove(); }

  U.startTutorial = function (key) {
    var tour = TOURS[key]; if (!tour) { U.toast("Tutorial not found"); return; }
    running = tour; step = 0;
    /* overlay */
    removeOverlay();
    var ov = document.createElement("div"); ov.id = "tut-overlay"; ov.className = "tut-overlay";
    document.body.appendChild(ov);
    showStep();
  };

  /* nav events */
  document.addEventListener("click", function (ev) {
    if (ev.target.id === "tut-next") { step++; showStep(); }
    else if (ev.target.id === "tut-prev") { step = Math.max(0, step - 1); showStep(); }
    else if (ev.target.id === "tut-skip") finish();
    else if (ev.target.id === "tut-overlay") finish();
    /* tutorial start buttons */
    var tb = ev.target.closest && ev.target.closest("[data-tutorial]");
    if (tb) U.startTutorial(tb.dataset.tutorial);
  });

  /* ---------- help / tutorials view ---------- */
  U.views.tutorials = function () {
    var h = "<div style='max-width:700px;display:flex;flex-direction:column;gap:16px'>";
    h += "<h1 style='margin:0'>Tutorials · ट्यूटोरियल</h1>";
    h += "<p class='muted' style='margin:0'>Step-by-step guides in Hindi & English. Each tutorial highlights the buttons and explains what to do. · हर ट्यूटोरियल बटन दिखाता है और समझाता है क्या करना है।</p>";

    var tours = [
      { key: "estimate", icon: "📋", title: "Estimate बनाना", en: "Create an Estimate", desc: "नया एस्टिमेट बनाएँ, मद (items) जोड़ें, माप भरें, दर लगाएँ।" },
      { key: "camera", icon: "📷", title: "GPS Camera", en: "Site photos with GPS", desc: "साइट फ़ोटो खींचें, GPS/समय अपने-आप छपे, ऑफलाइन भी काम करे।" },
      { key: "cad", icon: "📐", title: "CAD Drawing", en: "Create drawings", desc: "लाइन, रेक्टैंगल, डाइमेंशन — ड्राइंग बनाएँ और प्रिंट करें।" },
      { key: "bim", icon: "🏗️", title: "BIM & Quantity", en: "3D Building & Quantities", desc: "दीवार, स्लैब, सीढ़ी बनाएँ, quantity अपने-आप निकालें, IFC एक्सपोर्ट करें।" }
    ];

    tours.forEach(function (t) {
      h += "<div class='panel' style='padding:14px;display:flex;gap:14px;align-items:center'>" +
        "<span style='font-size:32px'>" + t.icon + "</span>" +
        "<div class='grow'><h3 style='margin:0'>" + esc(t.title) + " <span class='muted' style='font-weight:400'>· " + esc(t.en) + "</span></h3><p class='muted' style='margin:2px 0 0;font-size:13px'>" + esc(t.desc) + "</p></div>" +
        "<button type='button' class='btn pri sm' data-tutorial='" + t.key + "'>Start · शुरू करें</button></div>";
    });

    h += "<div class='panel' style='padding:14px'><h3 style='margin:0 0 6px'>Keyboard Shortcuts · कीबोर्ड शॉर्टकट</h3>" +
      "<table style='font-size:13px;border-collapse:collapse'>" +
      "<tr><td style='padding:2px 12px 2px 0'><kbd>Ctrl + K</kbd></td><td>Global search · खोजें</td></tr>" +
      "<tr><td style='padding:2px 12px 2px 0'><kbd>Ctrl + Shift + M</kbd></td><td>Voice input on current field · बोलकर लिखें</td></tr>" +
      "<tr><td style='padding:2px 12px 2px 0'><kbd>Ctrl + V</kbd></td><td>Paste from Excel (in estimate) · एक्सेल से पेस्ट</td></tr>" +
      "<tr><td style='padding:2px 12px 2px 0'><kbd>Ctrl + P</kbd></td><td>Print preview · प्रिंट</td></tr>" +
      "<tr><td style='padding:2px 12px 2px 0'><kbd>Esc</kbd></td><td>Close dialog / camera · बंद करें</td></tr>" +
      "</table></div>";

    h += "</div>";
    return h;
  };

  U.tutorialButton = function () {
    return '<button type="button" class="btn ghost sm" onclick="EP.ui.go(\'tutorials\')" title="Tutorials in Hindi & English · ट्यूटोरियल">❓ <span class="hide-sm">Help</span></button>';
  };

  /* CSS */
  var style = document.createElement("style");
  style.textContent = ".tut-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9990}" +
    ".tut-tip{position:fixed;z-index:9991;background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.25);padding:16px;max-width:380px;min-width:260px;animation:tut-in .2s ease-out}" +
    "@keyframes tut-in{from{opacity:0;transform:translateY(8px)}}" +
    ".tut-body p{margin:0;font-size:14px;line-height:1.5;white-space:pre-line}" +
    ".tut-nav{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:8px;border-top:1px solid #e5e7eb}" +
    ".tut-hl{outline:3px solid #1a73e8!important;outline-offset:2px;border-radius:4px;z-index:9992;position:relative;animation:tut-pulse 1.5s infinite}" +
    "@keyframes tut-pulse{0%,100%{outline-color:#1a73e8}50%{outline-color:#4da6ff}}" +
    "kbd{background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:1px 6px;font-family:inherit;font-size:12px}" +
    "@media(prefers-color-scheme:dark){.tut-tip{background:#1f2937;color:#f3f4f6}.tut-nav{border-color:#374151}kbd{background:#374151;border-color:#4b5563}}";
  document.head.appendChild(style);
})();
