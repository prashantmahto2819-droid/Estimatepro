/* Estimate Pro — Hindi / English voice entry (Web Speech API).
   * Any text input / note / measurement field can accept voice.
   * Works best in Chrome (Android & desktop) and Safari (iOS).
   * Number words (एक, दो, तीन, …) are converted to digits for measurements.
   * A small mic button appears inside supported fields. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;   // browser doesn't support it — degrade silently

  var rec = null, activeEl = null, lang = "hi-IN", listening = false;

  /* Hindi number words → digits */
  var HI_NUM = {
    "शून्य": "0", "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पांच": "5", "पाँच": "5",
    "छह": "6", "छे": "6", "सात": "7", "आठ": "8", "नौ": "9", "दस": "10",
    "ग्यारह": "11", "बारह": "12", "तेरह": "13", "चौदह": "14", "पंद्रह": "15", "पन्द्रह": "15",
    "सोलह": "16", "सत्रह": "17", "अठारह": "18", "उन्नीस": "19", "बीस": "20",
    "इक्कीस": "21", "बाईस": "22", "तेईस": "23", "चौबीस": "24", "पच्चीस": "25",
    "छब्बीस": "26", "सत्ताईस": "27", "अट्ठाईस": "28", "उनतीस": "29", "तीस": "30",
    "इकतीस": "31", "बत्तीस": "32", "तैंतीस": "33", "चौंतीस": "34", "पैंतीस": "35",
    "छत्तीस": "36", "सैंतीस": "37", "अड़तीस": "38", "उनतालीस": "39", "चालीस": "40",
    "इकतालीस": "41", "बयालीस": "42", "तैंतालीस": "43", "चवालीस": "44", "पैंतालीस": "45",
    "छियालीस": "46", "सैंतालीस": "47", "अड़तालीस": "48", "उनचास": "49", "पचास": "50",
    "साठ": "60", "सत्तर": "70", "अस्सी": "80", "नब्बे": "90", "सौ": "100",
    "हजार": "1000", "हज़ार": "1000", "लाख": "100000", "करोड़": "10000000",
    /* English number words too */
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15",
    "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19", "twenty": "20",
    "thirty": "30", "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
    "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000", "lakh": "100000", "crore": "10000000"
  };

  /* unit words → abbreviations */
  var UNITS = {
    "मीटर": "m", "meter": "m", "meters": "m", "metre": "m", "metres": "m",
    "सेंटीमीटर": "cm", "centimeter": "cm", "centimeters": "cm", "सेमी": "cm", "cm": "cm",
    "मिलीमीटर": "mm", "millimeter": "mm", "millimeters": "mm", "एमएम": "mm", "mm": "mm",
    "फुट": "ft", "foot": "ft", "feet": "ft", "फ़ीट": "ft", "फीट": "ft",
    "इंच": "in", "inch": "in", "inches": "in",
    "किलोमीटर": "km", "kilometer": "km", "kilometers": "km", "किमी": "km",
    "वर्ग मीटर": "sqm", "square meter": "sqm", "square meters": "sqm", "स्क्वायर मीटर": "sqm",
    "घन मीटर": "cum", "cubic meter": "cum", "cubic meters": "cum", "क्यूबिक मीटर": "cum",
    "लीटर": "ltr", "litre": "ltr", "liters": "ltr",
    "किलोग्राम": "kg", "kilogram": "kg", "किलो": "kg", "kg": "kg",
    "नंबर": "nos", "number": "nos", "numbers": "nos", "नग": "nos",
    "रनिंग मीटर": "rm", "running meter": "rm", "running meters": "rm", "आरएम": "rm",
    "बाय": "×", "by": "×", "into": "×", "गुना": "×", "x": "×",
    "पॉइंट": ".", "point": ".", "दशमलव": "."
  };

  function convertNumbers(text) {
    var words = text.split(/\s+/), out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i].toLowerCase().replace(/[।,]/g, "");
      if (HI_NUM[w] !== undefined) out.push(HI_NUM[w]);
      else if (UNITS[w] !== undefined) out.push(UNITS[w]);
      else out.push(words[i]);
    }
    return out.join(" ");
  }

  function init() {
    if (rec) return rec;
    rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = lang;

    rec.onresult = function (ev) {
      if (!activeEl) return;
      var t = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        t += ev.results[i][0].transcript;
      }
      t = convertNumbers(t.trim());
      /* for number-only fields strip non-numeric except .×/ */
      if (activeEl.type === "number" || activeEl.dataset.voiceNum) {
        t = t.replace(/[^0-9.,×/\s-]/g, "").trim();
      }
      /* append or replace? replace interim, append final */
      if (activeEl._voiceStart != null) {
        activeEl.value = activeEl.value.substring(0, activeEl._voiceStart) + t;
      }
      activeEl.dispatchEvent(new Event("input", { bubbles: true }));
    };

    rec.onend = function () {
      listening = false;
      updateMicButtons();
      /* auto restart if user hasn't clicked stop and field is still focused */
    };

    rec.onerror = function (ev) {
      listening = false;
      updateMicButtons();
      if (ev.error === "not-allowed") U.toast("Microphone permission is off — allow it in browser settings · माइक की अनुमति दें");
      else if (ev.error !== "aborted" && ev.error !== "no-speech") U.toast("Voice: " + ev.error);
    };

    return rec;
  }

  function startListening(el) {
    if (!el) return;
    var r = init();
    if (listening) { r.abort(); listening = false; activeEl = null; updateMicButtons(); return; }
    activeEl = el;
    activeEl._voiceStart = el.selectionStart != null ? el.selectionStart : el.value.length;
    r.lang = lang;
    try { r.start(); listening = true; } catch (e) { listening = false; }
    updateMicButtons();
  }

  function stopListening() {
    if (rec && listening) { rec.stop(); listening = false; activeEl = null; }
    updateMicButtons();
  }

  /* mic button injection */
  function updateMicButtons() {
    document.querySelectorAll(".voice-mic").forEach(function (btn) {
      btn.classList.toggle("voice-on", listening && activeEl === btn._voiceTarget);
      btn.title = listening && activeEl === btn._voiceTarget ? "Stop listening · सुनना बंद करें" : "Speak · बोलें (Hindi/English)";
    });
  }

  /* add mic button next to a field */
  function addMic(el) {
    if (!el || el._hasMic) return;
    el._hasMic = true;
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "voice-mic"; btn.setAttribute("aria-label", "Voice input");
    btn.title = "Speak · बोलें (Hindi/English)";
    btn.innerHTML = "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='9' y='1' width='6' height='12' rx='3'/><path d='M5 10a7 7 0 0 0 14 0'/><line x1='12' y1='17' x2='12' y2='22'/><line x1='8' y1='22' x2='16' y2='22'/></svg>";
    btn._voiceTarget = el;
    btn.addEventListener("click", function (ev) { ev.preventDefault(); startListening(el); });
    /* insert after the input */
    if (el.parentNode) {
      el.parentNode.style.position = "relative";
      el.style.paddingRight = "34px";
      btn.style.cssText = "position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#555;padding:2px;border-radius:50%;display:flex;align-items:center";
      el.parentNode.appendChild(btn);
    }
  }

  /* language toggle */
  U.voiceLang = function (l) { lang = l || "hi-IN"; if (rec) rec.lang = lang; };
  U.voiceToggle = function () { lang = lang === "hi-IN" ? "en-IN" : "hi-IN"; if (rec) rec.lang = lang; U.toast("Voice language: " + (lang === "hi-IN" ? "Hindi · हिंदी" : "English")); return lang; };

  /* auto-attach mic buttons to voice-enabled fields */
  var observer = new MutationObserver(function () {
    document.querySelectorAll("input.voice-in, textarea.voice-in, [data-voice]").forEach(addMic);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  /* initial scan */
  setTimeout(function () {
    document.querySelectorAll("input.voice-in, textarea.voice-in, [data-voice]").forEach(addMic);
  }, 1500);

  /* CSS for mic button */
  var style = document.createElement("style");
  style.textContent = ".voice-mic{z-index:2;transition:color .2s}.voice-mic:hover{color:#1a73e8}.voice-on{color:#d93025!important;animation:voice-pulse 1s infinite}.voice-on svg{stroke:#d93025}@keyframes voice-pulse{0%,100%{opacity:1}50%{opacity:.4}}";
  document.head.appendChild(style);

  /* global keyboard shortcut: Ctrl+Shift+M to toggle voice on focused field */
  document.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey && ev.shiftKey && ev.key === "M") {
      ev.preventDefault();
      var el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) startListening(el);
      else if (listening) stopListening();
    }
  });

  U.voice = { start: startListening, stop: stopListening, lang: function () { return lang; }, supported: true };
})();
