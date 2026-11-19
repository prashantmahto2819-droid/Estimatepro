/* Estimate Pro — Sample estimates for new users.
   Pre-built example estimates that users can load to learn the tool. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;

  var SAMPLES = [
    {
      name: "Building — 2 Room Set (MPPWD pattern)",
      nameHi: "भवन — 2 कमरे का सेट (MPPWD पैटर्न)",
      desc: "Simple 2-room residential building estimate with foundation, walls, RCC, plaster, flooring, doors and windows.",
      category: "building",
      gst: 18,
      items: [
        { desc: "Earthwork in excavation for foundation", no: 1, l: 32, b: 1.2, d: 1, unit: "cum", rate: 183 },
        { desc: "PCC 1:4:8 in foundation", no: 1, l: 32, b: 1.2, d: 0.15, unit: "cum", rate: 3842 },
        { desc: "RR masonry in foundation (1:6 CM)", no: 1, l: 32, b: 0.6, d: 0.45, unit: "cum", rate: 3252 },
        { desc: "Brick masonry in plinth (1:4 CM)", no: 1, l: 32, b: 0.3, d: 0.45, unit: "cum", rate: 6480 },
        { desc: "DPC 1:2:4 (40mm thick)", no: 1, l: 32, b: 0.3, d: 0.04, unit: "cum", rate: 5765 },
        { desc: "Brick masonry in superstructure (1:4 CM)", no: 1, l: 48, b: 0.23, d: 3, unit: "cum", rate: 6480 },
        { desc: "RCC M20 in lintels (1:1.5:3)", no: 6, l: 1.5, b: 0.23, d: 0.15, unit: "cum", rate: 8250 },
        { desc: "RCC M20 in roof slab 120mm", no: 1, l: 8, b: 5, d: 0.12, unit: "cum", rate: 8250 },
        { desc: "Steel reinforcement (Fe 500)", qty: 420, unit: "kg", rate: 72 },
        { desc: "12mm plaster (1:4) on walls", no: 2, l: 48, b: 1, d: 3, unit: "sqm", rate: 245 },
        { desc: "Flooring — vitrified tile 600×600", no: 1, l: 8, b: 5, d: 1, unit: "sqm", rate: 1250 },
        { desc: "Panelled wooden door (teak frame)", qty: 3, unit: "nos", rate: 12500 },
        { desc: "Steel window with glass", qty: 4, unit: "nos", rate: 4800 },
        { desc: "Whitewash (2 coats)", no: 2, l: 48, b: 1, d: 3, unit: "sqm", rate: 38 },
        { desc: "Anti-termite treatment", no: 1, l: 8, b: 5, d: 1, unit: "sqm", rate: 45 }
      ]
    },
    {
      name: "Road — WBM + BT surface (1 km)",
      nameHi: "सड़क — WBM + BT सतह (1 किमी)",
      desc: "Single-lane road construction: earthwork, sub-base GSB, WBM Grade-II & III, prime coat, bituminous tack, 20mm premix carpet, seal coat.",
      category: "road",
      gst: 18,
      items: [
        { desc: "Earthwork in formation — cutting", no: 1, l: 1000, b: 5.5, d: 0.3, unit: "cum", rate: 140 },
        { desc: "Earthwork in embankment (with compaction)", no: 1, l: 1000, b: 5.5, d: 0.15, unit: "cum", rate: 210 },
        { desc: "GSB (granular sub-base) 200mm", no: 1, l: 1000, b: 3.75, d: 0.2, unit: "cum", rate: 1200 },
        { desc: "WBM Grade-II (75mm)", no: 1, l: 1000, b: 3.75, d: 0.075, unit: "cum", rate: 2100 },
        { desc: "WBM Grade-III (75mm)", no: 1, l: 1000, b: 3.75, d: 0.075, unit: "cum", rate: 2250 },
        { desc: "Prime coat (MC-30)", no: 1, l: 1000, b: 3.75, d: 1, unit: "sqm", rate: 28 },
        { desc: "Tack coat (bitumen emulsion SS-1)", no: 1, l: 1000, b: 3.75, d: 1, unit: "sqm", rate: 15 },
        { desc: "20mm premix carpet with seal coat", no: 1, l: 1000, b: 3.75, d: 1, unit: "sqm", rate: 220 },
        { desc: "Stone edging (kerbstone)", no: 2, l: 1000, b: 1, d: 1, unit: "rm", rate: 180 },
        { desc: "Pipe culvert NP3 (900mm dia)", qty: 2, unit: "rm", rate: 8500 }
      ]
    },
    {
      name: "Retaining Wall (RCC cantilever, 3m height)",
      nameHi: "रिटेनिंग वॉल (RCC कैंटिलीवर, 3m ऊँचाई)",
      desc: "RCC cantilever retaining wall for road embankment or hillside: base slab, stem, toe, heel with weep holes and back fill.",
      category: "building",
      gst: 18,
      items: [
        { desc: "Earthwork excavation for base", no: 1, l: 20, b: 2.2, d: 0.6, unit: "cum", rate: 210 },
        { desc: "PCC M10 in levelling course (75mm)", no: 1, l: 20, b: 2.2, d: 0.075, unit: "cum", rate: 3842 },
        { desc: "RCC M25 in base slab (400mm)", no: 1, l: 20, b: 2.2, d: 0.4, unit: "cum", rate: 9200 },
        { desc: "RCC M25 in stem (250mm avg)", no: 1, l: 20, b: 0.25, d: 3, unit: "cum", rate: 9200 },
        { desc: "Steel reinforcement Fe-500D", qty: 1800, unit: "kg", rate: 72 },
        { desc: "Formwork (steel plates)", no: 1, l: 20, b: 3.5, d: 1, unit: "sqm", rate: 380 },
        { desc: "100mm PVC weep holes", qty: 20, unit: "nos", rate: 150 },
        { desc: "Filter media (gravel) behind wall", no: 1, l: 20, b: 0.3, d: 3, unit: "cum", rate: 1450 },
        { desc: "Backfill with approved material", no: 1, l: 20, b: 1.5, d: 3, unit: "cum", rate: 280 }
      ]
    },
    {
      name: "Drain — Brick-lined open (500m)",
      nameHi: "नाली — ईंट-लाइन्ड खुली (500m)",
      desc: "Open brick-lined drain alongside road: earthwork, PCC bed, brick masonry walls, plaster.",
      category: "road",
      gst: 18,
      items: [
        { desc: "Earthwork in drain trench", no: 1, l: 500, b: 0.75, d: 0.6, unit: "cum", rate: 183 },
        { desc: "PCC 1:4:8 in drain bed (100mm)", no: 1, l: 500, b: 0.45, d: 0.1, unit: "cum", rate: 3842 },
        { desc: "Brick masonry in drain walls (1:4 CM)", no: 2, l: 500, b: 0.115, d: 0.45, unit: "cum", rate: 6480 },
        { desc: "12mm plaster (1:3) inside drain", no: 1, l: 500, b: 1.35, d: 1, unit: "sqm", rate: 265 },
        { desc: "Cover slab — precast RCC", qty: 50, unit: "nos", rate: 850 }
      ]
    },
    {
      name: "Mining OB Dump — Reclamation",
      nameHi: "खदान OB डंप — पुनर्ग्रहण",
      desc: "Overburden dump area reclamation for SECL: slope dressing, soil cover, plantation, gabion wall, surface drain.",
      category: "mining",
      gst: 18,
      items: [
        { desc: "Slope dressing & grading (dozer)", qty: 5000, unit: "sqm", rate: 45 },
        { desc: "Top soil spreading (300mm)", no: 1, l: 100, b: 50, d: 0.3, unit: "cum", rate: 185 },
        { desc: "Plantation — mixed species (pit size 45×45×45 cm)", qty: 2500, unit: "nos", rate: 85 },
        { desc: "Mulching with organic waste", qty: 5000, unit: "sqm", rate: 18 },
        { desc: "Gabion wall (2m × 1m × 1m)", qty: 30, unit: "nos", rate: 8500 },
        { desc: "Surface drain (earthen, trapezoidal)", no: 1, l: 250, b: 0.6, d: 0.45, unit: "cum", rate: 165 },
        { desc: "Check dam (stone masonry)", qty: 5, unit: "nos", rate: 25000 },
        { desc: "Wire fencing (GI barbed)", no: 1, l: 500, b: 1, d: 1, unit: "rm", rate: 320 }
      ]
    }
  ];

  /* ---------- UI ---------- */
  U.views.samples = function () {
    var h = "<div style='max-width:900px;display:flex;flex-direction:column;gap:16px'>";
    h += "<h1 style='margin:0'>Sample Estimates · नमूना एस्टिमेट</h1>";
    h += "<p class='muted' style='margin:0'>Ready-made examples to learn how Estimate Pro works. Open one, study it, modify it, or use it as a template for your own estimate. · ये तैयार उदाहरण हैं, इनसे सीखें और अपने एस्टिमेट के लिए template की तरह इस्तेमाल करें।</p>";

    SAMPLES.forEach(function (s, i) {
      h += "<div class='panel' style='padding:14px;display:flex;gap:14px;align-items:flex-start'>" +
        "<span style='font-size:28px'>" + (s.category === "road" ? "🛣️" : s.category === "mining" ? "⛏️" : "🏗️") + "</span>" +
        "<div class='grow'><h3 style='margin:0 0 2px'>" + esc(s.name) + "</h3><p style='margin:0 0 2px;color:#555;font-size:13px'>" + esc(s.nameHi) + "</p><p class='muted' style='margin:0;font-size:13px'>" + esc(s.desc) + " · <b>" + s.items.length + " items</b></p></div>" +
        "<button type='button' class='btn pri sm' data-sample='" + i + "'>Open · खोलें</button></div>";
    });

    h += "</div>";
    return h;
  };

  /* load a sample into a new estimate */
  U.loadSample = function (idx) {
    var s = SAMPLES[idx]; if (!s) return;
    var doc = { name: s.name, gst: s.gst || 0, items: JSON.parse(JSON.stringify(s.items)), _sample: true };
    if (U.newEstimate) {
      U.newEstimate(s.name + " (sample)", doc);
      U.toast("Sample loaded — you can edit it freely · नमूना लोड हुआ, इसे बदलें जैसा चाहें");
    } else {
      /* fallback: store in S.est for the editor to pick up */
      S.est = S.est || {};
      S.est.sampleDoc = doc;
      S.est.sampleName = s.name + " (sample)";
      U.toast("Sample ready — go to Estimates to see it");
    }
  };

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-sample]");
    if (t) U.loadSample(+t.dataset.sample);
  });

  U.sampleEstimates = SAMPLES;
  U.samplesButton = function () {
    return '<button type="button" class="btn ghost sm" onclick="EP.ui.go(\'samples\')" title="Sample estimates to learn from · नमूना एस्टिमेट">📝 <span class="hide-sm">Samples</span></button>';
  };
})();
