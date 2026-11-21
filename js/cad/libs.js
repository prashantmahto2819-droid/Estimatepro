/* Estimate Pro CAD — things kept on this device for every drawing: a library of blocks, and hatch patterns
   loaded from AutoCAD .pat files (those used by a drawing are also saved inside it, so it opens right elsewhere). */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad; if (!CAD || !CAD.commands) return;
  var cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { if (!CAD.commands[x] && !CAD.aliases[x]) CAD.aliases[x] = n; }); };
  function get(k) { try { var v = JSON.parse(localStorage.getItem(k) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ---------- blocks library ---------- */
  CAD.blockLib = function () { return get("ep_blocklib"); };
  cmd("BLOCKKEEP", ["BLOCKSAVE", "KEEPBLOCK", "WBLOCK"], async function (ed) {
    var names = Object.keys(ed.doc.d.blocks || {}).filter(function (n) { return n[0] !== "*" && !/^(EL|SEC|SCH|DET)-/.test(n); }); if (!names.length) throw new Error("No blocks in this drawing yet. Make one with Block, then keep it.");
    var name = String((await ed.getText("Which block to keep on this device for other drawings? (" + names.slice(0, 12).join(", ") + (names.length > 12 ? "…" : "") + ")", { def: names[0] })) || "").trim(), B = ed.doc.d.blocks[name]; if (!B) throw new Error("Block " + name + " not found");
    var need = {}, walk = function (ents, depth) { ents.forEach(function (e) { if (e.t === "insert" && depth < 6 && ed.doc.d.blocks[e.block] && !need[e.block]) { need[e.block] = ed.doc.d.blocks[e.block]; walk(need[e.block].ents, depth + 1); } }); }; walk(B.ents, 0);
    var lib = get("ep_blocklib"); lib[name] = { base: B.base, ents: B.ents, units: (ed.doc.d.units && ed.doc.d.units.disp) || "mm", sub: need, at: Date.now() };
    if (!put("ep_blocklib", lib)) throw new Error("This device's storage is full — remove some kept blocks first (BLOCKLIB → Remove).");
    ed.say("Block " + name + " is kept on this device (" + Object.keys(lib).length + " in the library). In any drawing: Block library → " + name + ".");
  });
  cmd("BLOCKLIB", ["BLOCKLIBRARY", "MYBLOCKS"], async function (ed) {
    var lib = get("ep_blocklib"), names = Object.keys(lib).sort(); if (!names.length) throw new Error("No blocks kept on this device yet. In a drawing that has the block, use Keep block.");
    var name = String((await ed.getText("Block from the library, or Remove <name> (" + names.slice(0, 14).join(", ") + (names.length > 14 ? "…" : "") + ")", { def: ed.libLast && lib[ed.libLast] ? ed.libLast : names[0] })) || "").trim();
    var rm = /^remove\s+(.+)$/i.exec(name); if (rm) { var k = rm[1].trim(); if (!lib[k]) throw new Error("No kept block named " + k); delete lib[k]; put("ep_blocklib", lib); ed.say("Removed " + k + " from the library on this device (drawings that use it keep their copy)."); return; }
    var L = lib[name] || lib[names.filter(function (n) { return n.toLowerCase() === name.toLowerCase(); })[0]]; if (!L) throw new Error("No kept block named " + name);
    var Bl = Object.assign({}, ed.doc.d.blocks), had = !!Bl[name]; if (had) { var ow = await ed.getKw("This drawing already has a block " + name + ". Use the one from the library instead?", ["Yes", "No"], "No"); if (ow === "Yes") had = false; }
    if (!had) { Bl[name] = { base: L.base, ents: L.ents }; Object.keys(L.sub || {}).forEach(function (s) { if (!Bl[s]) Bl[s] = L.sub[s]; }); ed.doc.set("blocks", Bl); }
    ed.libLast = name; ed.insName = name; return CAD.commands.INSERT.fn(ed);
  });

  /* ---------- hatch patterns from .pat files ---------- */
  CAD.parsePat = function (txt) { var out = {}, cur = null; String(txt || "").split(/\r?\n/).forEach(function (ln) { ln = ln.replace(/;.*$/, "").trim(); if (!ln) return;
      if (ln[0] === "*") { var m = /^\*([^,]+),?(.*)$/.exec(ln), nm = m[1].trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, "_").slice(0, 31); cur = nm ? (out[nm] = { d: (m[2] || "").trim() || nm, f: [] }) : null; return; }
      if (!cur) return; var v = ln.split(",").map(function (x) { return parseFloat(x); }); if (v.length >= 5 && v.every(function (x) { return isFinite(x); })) cur.f.push(v); });
    Object.keys(out).forEach(function (k) { if (!out[k].f.length || out[k].f.length > 400) delete out[k]; }); return out; };
  function register(P) { var n = 0; Object.keys(P || {}).forEach(function (k) { var p = P[k]; if (!p || !Array.isArray(p.f) || CAD.HATCH[k] && !CAD.HATCH[k].own) return; CAD.HATCH[k] = { d: p.d || k, f: p.f, own: true }; n++; }); return n; }
  register(get("ep_pats"));
  CAD.HOOKS.wire.push(function (ed) { try { register(ed.doc.d.pats); } catch (e) {} });
  cmd("HATCHLOAD", ["LOADPAT", "PATLOAD", "HATCHIMPORT"], function (ed) {
    return new Promise(function (res, rej) { var inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pat,.txt,text/plain"; inp.style.display = "none"; document.body.appendChild(inp); var done = false;
      inp.addEventListener("change", function () { done = true; var f = inp.files && inp.files[0]; inp.remove(); if (!f) return res(); var rd = new FileReader();
        rd.onload = function () { try { var P = CAD.parsePat(rd.result), names = Object.keys(P), clash = names.filter(function (k) { return CAD.HATCH[k] && !CAD.HATCH[k].own; }); names = names.filter(function (k) { return clash.indexOf(k) < 0; });
            if (!names.length) return rej(new Error(clash.length ? "The patterns in this file have the names of built-in patterns (" + clash.slice(0, 5).join(", ") + ") — nothing new to load." : "No hatch pattern found in this file. It should be an AutoCAD .pat file: a line starting with *NAME, then lines of numbers."));
            var keep = get("ep_pats"), dp = Object.assign({}, ed.doc.d.pats || {}); names.forEach(function (k) { keep[k] = P[k]; dp[k] = P[k]; }); put("ep_pats", keep); ed.doc.set("pats", dp); register(P); ed.hPat = names[0];
            ed.say(names.length + " pattern(s) loaded: " + names.slice(0, 10).join(", ") + (names.length > 10 ? "…" : "") + ". They are now in Hatch → Pattern on this device and are saved inside this drawing. AutoCAD patterns are in drawing units of 1 — in a millimetre drawing start with a scale of 10 to 50."); res(); } catch (er) { rej(er); } };
        rd.onerror = function () { rej(new Error("Could not read the file.")); }; rd.readAsText(f); });
      window.addEventListener("focus", function h() { window.removeEventListener("focus", h); setTimeout(function () { if (!done) { inp.remove(); res(); } }, 800); });
      ed.say("Choose an AutoCAD hatch pattern file (.pat)…"); inp.click(); });
  });
})();
