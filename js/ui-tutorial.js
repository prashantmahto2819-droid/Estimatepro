/* Estimate Pro — Hindi guided tutorials (in-app walkthrough).
   Step-by-step interactive tour for each major feature.
   Shows a tooltip that highlights a UI element and explains what to do. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;

  var running = null, step = 0;

  /* Each step: el = CSS selector of the real control (the tip is centred when it is not on screen),
     tab = ribbon tab of CAD Studio to open first. Keep selectors in step with the screens:
     estimate → js/ui-est.js, CAD ribbon → data-cc / data-rtab in js/ui-cad.js, top bar → data-cad. */
  var TOURS = {
    estimate: {
      title: "Estimate बनाना सीखें", titleEn: "Learn to create an Estimate",
      steps: [
        { el: "[data-nav='est']", text: "'Estimates' खोलें — यहाँ आपके सारे एस्टिमेट रहते हैं।", en: "Open 'Estimates' — all your estimates are here." },
        { el: "#new-est", text: "'+ New estimate' दबाएँ और नाम लिखें।", en: "Press '+ New estimate' and type a name." },
        { el: "#est-name", text: "यह एस्टिमेट का नाम है — कभी भी बदल सकते हैं। सब कुछ अपने-आप सेव होता है।", en: "This is the estimate name — change it any time. Everything saves by itself." },
        { el: "#add-q", text: "यहाँ आइटम खोजें — कोड (5.3) या शब्द (gitti, sariya, pcc) लिखें और सूची से चुनें।", en: "Search an item here — type a code (5.3) or words, then pick from the list." },
        { el: "#add-book", text: "रेट बुक चुनें — CPWD DSR, MP PWD, Horticulture, E&M।", en: "Choose the rate book — CPWD DSR, MP PWD, Horticulture, E&M." },
        { el: "#add-x", text: "SOR में नहीं है? '+ Non-SOR (NS) item' से बाज़ार का आइटम जोड़ें — तैयार विश्लेषण के साथ।", en: "Not in the SOR? Add a market item with '+ Non-SOR (NS) item' — ready analyses included." },
        { el: "[data-sub='abstract']", text: "'Abstract' में पूरा सार, 'Export to Excel' में फ़ॉर्मूले वाली एक्सेल फ़ाइल।", en: "'Abstract' shows the summary; 'Export to Excel' gives a workbook with formulas." }
      ]
    },
    measure: {
      title: "माप (Measurement) भरना", titleEn: "Measurement sheet",
      steps: [
        { el: "[data-madd]", text: "आइटम खोलकर '+ Row' से माप की लाइन जोड़ें: No. × L × B × D/H × Factor।\n'+ Deduction' से दरवाज़े-खिड़की घटाएँ।", en: "Open an item and add rows with '+ Row': No. × L × B × D/H × Factor. Use '+ Deduction' for openings." },
        { el: "[data-mf$='|l']", text: "माप मीटर में हैं। आप 10'6\", 450mm, 30cm, 12ft भी लिख सकते हैं — अपने-आप मीटर बन जाएगा।\nजोड़-घटाव भी: (3+5)/2, pi*0.6^2/4", en: "Sizes are in metres. You can also type 10'6\", 450mm, 30cm, 12ft — read as metres — and sums like (3+5)/2." },
        { el: "[data-mshape]", text: "'+ Shape row' — त्रिकोण, गोला, ट्रेपेज़ियम, गोल कॉलम, ढलान छत, खाई… तैयार फ़ॉर्मूला के साथ लाइन जुड़ती है।", en: "'+ Shape row' adds a ready row for a triangle, circle, trapezium, round column, sloping roof, trench…" },
        { el: "[data-mdup]", text: "⧉ से लाइन की कॉपी नीचे बनती है — एक जैसे कमरों के लिए।", en: "⧉ copies a row below — handy for similar rooms." },
        { el: "[data-madd$='|st']", text: "'+ Sub-total' और '+ Net total' से हिस्सों का जोड़ दिखाएँ। '+ Add qty of another item' से दूसरे आइटम की मात्रा लें (जैसे प्लास्टर = ईंट की दीवार)।", en: "Show part totals with '+ Sub-total' / '+ Net total'. Take another item's quantity with '+ Add qty of another item'." },
        { el: "details.qcv", text: "'Convert' — माप फ़ुट, cft, brass, kg में लिखे हों तो एक बटन से आइटम की यूनिट में बदलें।", en: "'Convert' — if your rows are in ft, cft, brass or kg, one button converts them to the item's unit." },
        { el: "[data-anop]", text: "'Check / edit rate analysis' — दर का पूरा विश्लेषण देखें और बदलें।", en: "'Check / edit rate analysis' — see and edit the full rate analysis." }
      ]
    },
    camera: {
      title: "GPS Camera इस्तेमाल करें", titleEn: "Use the GPS Camera",
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
      title: "CAD Studio — ड्रॉइंग बनाना", titleEn: "CAD Studio — drawing basics",
      steps: [
        { el: "[data-nav='cad']", text: "'CAD Studio' खोलें और '+ New drawing' से नई ड्रॉइंग बनाएँ।", en: "Open 'CAD Studio' and make a drawing with '+ New drawing'." },
        { el: ".cad-rtabs", text: "ऊपर टैब हैं: Home, Draw, Modify, Annotate, Building, Roads, Site, Block, Measure, View।\nहर टैब में बटन नाम वाले हिस्सों में बँटे हैं।", en: "Tabs on top: Home, Draw, Modify, Annotate, Building, Roads, Site, Block, Measure, View. Buttons in each tab are grouped under named sections." },
        { tab: "Draw", el: "[data-rgrp='Draw'] [data-cc='LINE']", text: "'Line' — पॉइंट क्लिक करें, या लंबाई टाइप करके Enter दबाएँ। Enter से पूरा।", en: "'Line' — click points, or type a length and press Enter. Enter finishes." },
        { tab: "Draw", el: "[data-rgrp='Draw'] [data-cc='RECTANG']", text: "'Rectangle' — दो कोने क्लिक करें। Circle, Arc, Polygon भी यहीं हैं।", en: "'Rectangle' — click two corners. Circle, Arc and Polygon are here too." },
        { tab: "Modify", el: "[data-rgrp='Modify'] [data-cc='MOVE']", text: "Modify टैब: Move, Copy, Rotate, Mirror, Offset, Trim…\nकिसी चीज़ को चुनकर उसके नीले बिंदु (grip) खींचकर भी बदल सकते हैं।", en: "Modify tab: Move, Copy, Rotate, Mirror, Offset, Trim… You can also select an object and drag its blue grips." },
        { tab: "Annotate", el: "[data-rgrp='Annotate'] [data-cc='DIMLINEAR']", text: "Annotate टैब: माप (Dimension) और टेक्स्ट। 'Auto dimension' पूरी बिल्डिंग के माप एक बार में लगाता है।", en: "Annotate tab: dimensions and text. 'Auto dimension' dimensions the whole building in one step." },
        { el: ".cad-status", text: "नीचे की पट्टी: OSNAP (कोनों पर चिपकना), ORTHO (सीधी लाइन), GRID। क्लिक करके चालू/बंद करें।", en: "Status bar: OSNAP (snap to corners), ORTHO (straight lines), GRID. Click to switch on / off." },
        { el: "[data-cad='menu']", text: "'File' — सेव, DXF/PDF/PNG एक्सपोर्ट, DXF या PDF जोड़ना।", en: "'File' — save, export DXF / PDF / PNG, attach a DXF or PDF." }
      ]
    },
    bim: {
      title: "बिल्डिंग बनाना (BIM) और मात्रा", titleEn: "Building (BIM) and quantities",
      steps: [
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='WALL']", text: "'Wall' — पॉइंट क्लिक करते जाएँ, दीवारें बनती जाएँगी। मोटाई/ऊँचाई कमांड लाइन के विकल्पों से बदलें।", en: "'Wall' — keep clicking points to draw walls. Change thickness / height from the options in the command line." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='DOOR']", text: "'Door' और 'Window' — दीवार पर क्लिक करें, अपने-आप उसमें बैठ जाते हैं।", en: "'Door' and 'Window' — click on a wall, they fit into it." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='COLUMN']", text: "'Column' — 'Corners' से हर कोने पर कॉलम; 'Shape' से गोल, अष्टकोण, L, T, + आकार।", en: "'Column' — 'Corners' puts one at every corner; 'Shape' gives round, octagon, L, T, + sections." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='SLAB']", text: "'Slab' — 'Walls' चुनें तो पूरी बिल्डिंग पर स्लैब एक बार में।", en: "'Slab' — choose 'Walls' to cover the whole building in one step." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='ROOM']", text: "'Room' — कमरे के अंदर क्लिक करें: फ़र्श, स्कर्टिंग, फ़ॉल्स सीलिंग की मात्रा निकलती है।", en: "'Room' — click inside a room: floor, skirting and false ceiling quantities follow." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='FLOORCOPY']", text: "'Levels' से मंज़िलें बनाएँ, 'Copy floor' से पूरी मंज़िल ऊपर कॉपी करें।", en: "Make storeys with 'Levels'; 'Copy floor' copies a whole floor upward." },
        { el: "[data-cad='v3']", text: "'3D' — बिल्डिंग घुमाकर देखें। Paint से रंग/मटेरियल, Sun से धूप, Render से तस्वीर।", en: "'3D' — orbit the building. Paint for colours / materials, Sun for sunlight, Render for a picture." },
        { el: "[data-v3m='walk']", text: "3D में '🚶 Walk' — बिल्डिंग के अंदर चलकर देखें। '📏 Measure' — दो बिंदु क्लिक करके नाप लें। '⟳ Spin' — मॉडल धीरे घूमता है।", en: "In 3D: '🚶 Walk' goes through the building, '📏 Measure' measures between two clicked points, '⟳ Spin' turns the model slowly." },
        { el: "[data-cad='qto']", text: "'Σ Quantities' — सारी मात्राएँ SOR आइटम के साथ; एक बटन से एस्टिमेट में भेजें।", en: "'Σ Quantities' — all quantities with their SOR items; send them to an estimate with one button." }
      ]
    },
    finish: {
      title: "छत, पैरापेट, रेलिंग", titleEn: "Roof, parapet and railing",
      steps: [
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='ROOF']", text: "'Roof' — Flat, Shed, Gable या Hip। 'Walls' चुनें तो छत पूरी बिल्डिंग पर अपने-आप बैठती है (L, T, U आकार पर भी)।", en: "'Roof' — Flat, Shed, Gable or Hip. With 'Walls' the roof fits the whole building (L, T, U shapes too)." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='PARAPET']", text: "'Parapet' — 'Design' से 10 डिज़ाइन: सॉलिड, कट्स, जाली, बलस्टर, कंगूरा, नीची दीवार + रेलिंग/ग्लास।\n'Around' दबाकर स्लैब पर क्लिक करें — पूरा घेरा बन जाता है।", en: "'Parapet' — 10 designs under 'Design'. Press 'Around' and click the slab to go all round." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='RAILING']", text: "'Railing' — MS, SS, ग्लास, कास्ट आयरन, लकड़ी, लेज़र-कट। बाद में चुनकर Properties में Design बदल सकते हैं।", en: "'Railing' — MS, SS, glass, cast iron, wood, laser-cut. Select it later and change Design in Properties." },
        { tab: "Building (BIM)", el: "[data-rgrp='Building (BIM)'] [data-cc='STAIR']", text: "'Stair' — सीधी या डॉग-लेग्ड सीढ़ी; 2R + T की जाँच Properties में दिखती है।", en: "'Stair' — straight or dog-legged; the 2R + T check shows in Properties." },
        { el: "[data-cadtab='props']", text: "किसी भी चीज़ को चुनें → 'Properties' में उसका डिज़ाइन, नाप और मटेरियल बदलें।", en: "Select anything → change its design, sizes and material in 'Properties'." }
      ]
    },
    library: {
      title: "लाइब्रेरी, मटेरियल और मंदिर/ग्रिल", titleEn: "Library, materials, temple and grills",
      steps: [
        { el: "[data-cad='side']", text: "'☰ Panel' से साइड पैनल खोलें।", en: "Open the side panel with '☰ Panel'." },
        { el: "[data-cadtab='lib']", text: "'Library' — फ़र्नीचर, लाइट, सैनिटरी, पार्टिशन, वॉल पैनल, मंदिर (गुंबद, शिखर, कलश), ग्रिल और गेट।\nकार्ड को खींचकर ड्रॉइंग पर छोड़ें।", en: "'Library' — furniture, lights, sanitary, partitions, wall panels, temple items, grills and gates. Drag a card onto the drawing." },
        { el: "[data-cadtab='lib']", text: "'Decoration (view only)' — लोग, कार, पेड़, फूल, सड़क, ज़ेब्रा क्रॉसिंग… ये सिर्फ़ दिखाने के लिए हैं, एस्टिमेट में नहीं जुड़ते।\nकिसी भी आइटम को Properties में 'Count in the estimate → No' करके एस्टिमेट से बाहर रख सकते हैं।", en: "'Decoration (view only)' — people, cars, trees, flowers, road pieces… for the view only, never in the estimate. Any item can be kept out with 'Count in the estimate → No'." },
        { tab: "Site & services", el: "[data-rgrp='Site & services'] [data-cc='ASSET']", text: "या 'Library item' कमांड से रखें। दीवार के पास आइटम अपने-आप दीवार से लग जाता है।", en: "Or place with the 'Library item' command. Near a wall the item snaps to it." },
        { el: "[data-cadtab='props']", text: "ऊँचाई आसान: 'Height is measured from' में फ़र्श / फ़ॉल्स सीलिंग / स्लैब के नीचे / स्लैब के ऊपर चुनें और दूरी लिखें।", en: "Easy height: choose floor / false ceiling / under slab / on top of slab in 'Height is measured from' and type the distance." },
        { el: "[data-cad='v3']", text: "3D में 'Paint' — टाइल्स, पत्थर, पेंट, टेक्सचर, धातु चुनकर किसी भी सतह पर क्लिक करें।", en: "In 3D use 'Paint' — pick tiles, stone, paint, texture or metal and click any surface." },
        { el: "[data-cad='qto']", text: "ग्रिल, गेट, रेलिंग की मात्रा kg / sqm में अपने-आप आती है और CPWD आइटम से जुड़ती है।", en: "Grills, gates and railings are measured in kg / sqm and linked to their CPWD items." }
      ]
    }
  };

  /* ---------- tooltip rendering ---------- */
  function showStep() {
    removeTooltip();
    if (!running || step >= running.steps.length) { finish(); return; }
    var s = running.steps[step], el = null;
    if (s.tab) { try { var tb = document.querySelector("[data-rtab='" + s.tab + "']"); if (tb && tb.getAttribute("aria-selected") !== "true") tb.click(); } catch (e) {} }
    try { el = document.querySelector(s.el); if (el && !el.getClientRects().length) el = null; } catch (e) {}

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
      { key: "estimate", icon: "📋", title: "Estimate बनाना", en: "Create an Estimate", desc: "नया एस्टिमेट, आइटम खोजना, Non-SOR आइटम, Abstract और Excel।" },
      { key: "measure", icon: "📏", title: "माप भरना", en: "Measurement sheet", desc: "लाइनें, घटाव, फ़ुट-इंच / mm में लिखना, आकार वाली लाइनें, यूनिट बदलना। (पहले किसी एस्टिमेट में एक आइटम खोलें)" },
      { key: "camera", icon: "📷", title: "GPS Camera", en: "Site photos with GPS", desc: "साइट फ़ोटो खींचें, GPS/समय अपने-आप छपे, ऑफलाइन भी काम करे।" },
      { key: "cad", icon: "📐", title: "CAD Studio — ड्रॉइंग", en: "Drawing basics", desc: "टैब और हिस्से, लाइन, रेक्टैंगल, बदलना, माप, एक्सपोर्ट। (पहले CAD Studio में एक ड्रॉइंग खोलें)" },
      { key: "bim", icon: "🏗️", title: "बिल्डिंग और मात्रा", en: "Building (BIM) & quantities", desc: "दीवार, दरवाज़ा, कॉलम, स्लैब, कमरा, मंज़िलें, 3D और Σ Quantities।" },
      { key: "finish", icon: "🏠", title: "छत, पैरापेट, रेलिंग", en: "Roof, parapet, railing", desc: "छत के प्रकार, पैरापेट के 10 डिज़ाइन, रेलिंग के 11 डिज़ाइन।" },
      { key: "library", icon: "🪑", title: "लाइब्रेरी और मटेरियल", en: "Library & materials", desc: "फ़र्नीचर, लाइट, मंदिर, ग्रिल-गेट रखना; ऊँचाई चुनना; 3D में रंग और टाइल्स।" }
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
