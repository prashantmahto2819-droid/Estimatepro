/* Keep open / closed sections as the user left them. Many screens (Design Studio, Building Planner, …) redraw their form after every
   change, and each redraw used to fold the <details> sections back to their defaults — picking one option in a dropdown closed the
   section the user was working in. This remembers every section the user opens or closes (by its title, numbers ignored, per screen)
   and puts it back the same way whenever the section is drawn again. Works for every screen, including new ones. */
(function () {
  "use strict";
  var KEY = "ep_keepopen_v1", mem = {};
  try { mem = JSON.parse(sessionStorage.getItem(KEY) || "{}") || {}; } catch (e) { mem = {}; }
  var save = function () { try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };
  /* the screen the section belongs to (nearest tab / panel id) + its title without counts or numbers */
  var keyOf = function (d) {
    var s = d.querySelector(":scope > summary"); if (!s) return null;
    var t = (s.textContent || "").replace(/[\d.,]+/g, "#").replace(/\s+/g, " ").trim().slice(0, 80); if (!t) return null;
    var p = d.closest("[id^='view-'], [id^='tab-'], [data-plmode-root], section[id], main[id]");
    return (p ? (p.id || p.getAttribute("data-plmode-root") || "") : "") + "|" + t;
  };
  /* user opens / closes a section: remember it (only real clicks / keys on the summary, not redraws) */
  var note = function (e) {
    var s = e.target && e.target.closest && e.target.closest("summary"); if (!s) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    var d = s.parentElement; if (!d || d.tagName !== "DETAILS") return;
    setTimeout(function () { var k = keyOf(d); if (k) { mem[k] = d.open ? 1 : 0; save(); } }, 0);
  };
  document.addEventListener("click", note, true); document.addEventListener("keydown", note, true);
  /* any section drawn (again): give it the state the user chose */
  var apply = function (root) {
    if (!root || root.nodeType !== 1) return;
    var list = root.tagName === "DETAILS" ? [root] : []; if (root.querySelectorAll) list = list.concat([].slice.call(root.querySelectorAll("details")));
    list.forEach(function (d) { var k = keyOf(d); if (k && Object.prototype.hasOwnProperty.call(mem, k)) { var want = !!mem[k]; if (d.open !== want) d.open = want; } });
  };
  var start = function () {
    apply(document.body);
    new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, apply); }); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
