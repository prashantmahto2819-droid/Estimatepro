/* Estimate Pro — Excel / Google Sheets paste support.
   When the user copies rows from Excel / Sheets / a TSV and pastes
   into the estimate editor, this module parses the clipboard,
   converts it to estimate line items and inserts them.

   Expected column order (flexible, auto-detected):
     Sr | Description | No | L | B | D/H | Unit | Rate | Qty | Amount
   or simplified:
     Description | Qty | Unit | Rate

   Works with both tab-separated (Excel/Sheets) and comma-separated (CSV). */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui;

  /* column header detection patterns */
  /* whole words only: a word list, then the end of the cell or a space / . / ( / / / : (e.g. "L (m)", "Sl. No.", "D/H", "Description of item") */
  function W(words) { return new RegExp("^(?:" + words + ")\\.?(?:[\\s(/:].*)?$", "i"); }
  var COL = {
    sr:    W("sr|s\\.?\\s?no|sl|sl\\.?\\s?no|#|क्रम|क्र\\.?\\s?सं"),
    desc:  W("desc|description|item|items|particulars|work|विवरण|मद|name"),
    no:    W("no|nos|number|नग|संख्या"),
    len:   W("l|length|लंबाई|लम्बाई"),
    bre:   W("b|breadth|width|w|चौड़ाई"),
    dep:   W("d|h|d/h|depth|height|ht|गहराई|ऊँचाई|ऊंचाई"),
    unit:  W("unit|units|इकाई"),
    rate:  W("rate|दर|price|मूल्य"),
    qty:   W("qty|quantity|मात्रा|q"),
    amt:   W("amt|amount|total|कुल|राशि")
  };

  function num(v) {
    if (v == null || v === "") return null;
    var s = String(v).replace(/[₹,\s]/g, "").replace(/−/g, "-");
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function detectSep(text) {
    var firstLine = text.split(/\r?\n/)[0] || "";
    var tabs = (firstLine.match(/\t/g) || []).length;
    var commas = (firstLine.match(/,/g) || []).length;
    return tabs || !commas ? "\t" : ",";
  }

  /* CSV / TSV with quoted cells ("1,200", "say ""A""", cells with line breaks) */
  function parseRows(text) {
    var sep = detectSep(text), rows = [], row = [], cell = "", q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"' && !cell.trim()) { q = true; cell = ""; }
      else if (ch === sep) { row.push(cell.trim()); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    row.push(cell.trim()); rows.push(row);
    return rows.filter(function (r) { return r.some(function (c) { return c; }); });
  }

  function detectColumns(headerRow) {
    var map = {};
    headerRow.forEach(function (cell, i) {
      var c = cell.trim();
      for (var k in COL) {
        if (COL[k].test(c) && map[k] == null) { map[k] = i; break; }
      }
    });
    return map;
  }

  function isHeaderRow(row) {
    if (row.some(function (cell) { return num(cell) != null; })) return false;   // a row with numbers is data
    var matches = 0;
    row.forEach(function (cell) {
      for (var k in COL) { if (COL[k].test(cell.trim())) { matches++; break; } }
    });
    return matches >= 2;
  }

  /* convert parsed rows to estimate items */
  function toItems(rows) {
    if (!rows.length) return [];
    var hasHeader = isHeaderRow(rows[0]);
    var colMap = hasHeader ? detectColumns(rows[0]) : null;
    var dataRows = hasHeader ? rows.slice(1) : rows;
    var items = [];

    dataRows.forEach(function (row) {
      if (!row.some(function (c) { return c.trim(); })) return; // skip blank
      var item = { desc: "", no: null, l: null, b: null, d: null, unit: "", rate: null, qty: null };

      if (colMap) {
        if (colMap.desc != null) item.desc = row[colMap.desc] || "";
        if (colMap.no != null) item.no = num(row[colMap.no]);
        if (colMap.len != null) item.l = num(row[colMap.len]);
        if (colMap.bre != null) item.b = num(row[colMap.bre]);
        if (colMap.dep != null) item.d = num(row[colMap.dep]);
        if (colMap.unit != null) item.unit = row[colMap.unit] || "";
        if (colMap.rate != null) item.rate = num(row[colMap.rate]);
        if (colMap.qty != null) item.qty = num(row[colMap.qty]);
        if (colMap.amt != null && item.qty == null && item.rate != null) {
          var a = num(row[colMap.amt]); if (a != null && item.rate) item.qty = Math.round((a / item.rate) * 1000) / 1000;
        }
      } else {
        /* auto: guess by position. Common patterns:
           4 cols: desc, qty, unit, rate
           6+ cols: sr, desc, no, l, b, d, unit, rate */
        if (row.length >= 8) {
          item.desc = row[1] || row[0]; item.no = num(row[2]); item.l = num(row[3]); item.b = num(row[4]); item.d = num(row[5]); item.unit = row[6] || ""; item.rate = num(row[7]);
        } else if (row.length >= 4) {
          item.desc = row[0]; item.qty = num(row[1]); item.unit = row[2] || ""; item.rate = num(row[3]);
        } else if (row.length >= 2) {
          item.desc = row[0]; item.qty = num(row[1]);
        } else {
          item.desc = row[0] || "";
        }
      }

      /* compute qty from dimensions if not given */
      if (item.qty == null) {
        var one = function (v) { return v != null ? v : 1; };
        var q = one(item.no) * one(item.l) * one(item.b) * one(item.d);
        if (item.l != null || item.b != null || item.d != null) item.qty = Math.round(q * 1000) / 1000;
      }

      if (item.desc || item.qty != null) items.push(item);
    });

    return items;
  }

  /* preview dialog */
  function preview(text) {
    var rows = parseRows(text), items = toItems(rows);
    if (!items.length) { U.toast("Clipboard has no usable rows · क्लिपबोर्ड में कोई पंक्ति नहीं मिली"); return; }

    var h = "<div class='paste-dlg'><h3>Paste from Excel / Sheets · एक्सेल से पेस्ट</h3><p>" + items.length + " row" + (items.length === 1 ? "" : "s") + " detected</p>" +
      "<div class='paste-tbl'><table><thead><tr><th>#</th><th>Description</th><th>No</th><th>L</th><th>B</th><th>D/H</th><th>Unit</th><th>Rate</th><th>Qty</th></tr></thead><tbody>" +
      items.map(function (it, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + U.esc(it.desc) + "</td><td>" + (it.no != null ? it.no : "") + "</td><td>" + (it.l != null ? it.l : "") + "</td><td>" + (it.b != null ? it.b : "") + "</td><td>" + (it.d != null ? it.d : "") + "</td><td>" + U.esc(it.unit) + "</td><td>" + (it.rate != null ? it.rate : "") + "</td><td>" + (it.qty != null ? it.qty : "") + "</td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      "<div class='row' style='gap:8px;justify-content:flex-end;margin-top:12px'><button type='button' class='btn ghost' id='paste-cancel'>Cancel · रद्द करें</button><button type='button' class='btn pri' id='paste-insert'>Insert " + items.length + " row" + (items.length === 1 ? "" : "s") + " · डालें</button></div></div>";

    U.modal(h);
    S._pasteItems = items;
  }

  /* insert into estimate */
  function insertItems(items) {
    if (!items || !items.length) return;
    if (U.insertEstRows) {
      U.insertEstRows(items);
      U.toast(items.length + " row" + (items.length === 1 ? "" : "s") + " inserted · " + items.length + " पंक्तियाँ जोड़ी गईं");
    } else {
      U.toast("Open an estimate first, then paste · पहले एस्टिमेट खोलें");
    }
  }

  /* paste event listener — only triggers in estimate editor context */
  document.addEventListener("paste", function (ev) {
    /* only intercept if we're in the estimate view and not in a regular input */
    var tag = (document.activeElement || {}).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!S.est || !S.est.cur || !U.insertEstRows) return;   // only when an estimate is open and rows can be inserted

    var text = (ev.clipboardData || window.clipboardData || {}).getData && ev.clipboardData.getData("text/plain");
    if (!text || !text.trim()) return;

    /* must look like tabular data: at least one tab or comma, and at least 2 lines */
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return;
    if (!text.includes("\t") && (text.match(/,/g) || []).length < 2) return;

    ev.preventDefault();
    preview(text);
  });

  /* button events */
  document.addEventListener("click", function (ev) {
    if (ev.target.id === "paste-cancel") { U.closeModal(); delete S._pasteItems; }
    else if (ev.target.id === "paste-insert") { insertItems(S._pasteItems); delete S._pasteItems; U.closeModal(); }
  });

  /* paste button for the toolbar */
  U.pasteButton = function () {
    return '<button type="button" class="btn ghost sm" id="est-paste" title="Paste rows from Excel / Google Sheets · Ctrl+V">📋 Paste from Excel</button>';
  };
  document.addEventListener("click", function (ev) {
    if (ev.target.closest && ev.target.closest("#est-paste")) {
      navigator.clipboard.readText().then(function (text) {
        if (text && text.trim()) preview(text);
        else U.toast("Clipboard is empty — copy rows from Excel / Sheets first · पहले Excel से कॉपी करें");
      }).catch(function () {
        U.toast("Allow clipboard access, or use Ctrl+V to paste · क्लिपबोर्ड एक्सेस दें या Ctrl+V दबाएँ");
      });
    }
  });

  /* CSS */
  var style = document.createElement("style");
  style.textContent = ".paste-dlg{max-width:720px}.paste-tbl{max-height:340px;overflow:auto;border:1px solid #d1d5db;border-radius:6px}.paste-tbl table{width:100%;border-collapse:collapse;font-size:13px}.paste-tbl th,.paste-tbl td{padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:left;white-space:nowrap}.paste-tbl th{position:sticky;top:0;background:#f3f4f6;font-weight:600}";
  document.head.appendChild(style);

  U.paste = { parse: parseRows, detect: detectColumns, convert: toItems, preview: preview };
})();
