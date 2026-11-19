/* Estimate Pro — Phase H: export the model as GLB (glTF 2.0 binary), OBJ + MTL and IFC4 (STEP).
   All three are written from the same triangles as the 3D view (B.meshes), in metres.
   GLB / OBJ use the y-up convention of those formats; IFC keeps z-up (IFC is z-up) with one triangulated face set per element,
   spatial structure Project → Site → Building → Storeys, element classes by type and an IfcElementQuantity with the quantities
   that go to the estimate. Openings are already cut in the wall meshes (no IfcOpeningElement). */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim;
  function groupsOf(doc, opts) { opts = opts || {}; var sc = B.meshes(doc, { allLevels: true, rebar: !!opts.rebar }); var types = {}; doc.d.ents.forEach(function (e) { types[e.id] = e; }); return { sc: sc, ents: types }; }
  /* triangles of a group, split by material (colour + opacity) */
  function byMat(g) {
    var out = {}, v = g.v, ST = B.VSTRIDE;
    for (var i = 0; i + 3 * ST <= v.length; i += 3 * ST) {
      var r = v[i + 6], gg = v[i + 7], b = v[i + 8], a = v[i + 9], key = [r, gg, b, a].map(function (x) { return Math.round(x * 100); }).join("_");
      var m = out[key] || (out[key] = { col: [r, gg, b, a], p: [], n: [] });
      for (var k = 0; k < 3; k++) { var o = i + k * ST; m.p.push(v[o], v[o + 1], v[o + 2]); m.n.push(v[o + 3], v[o + 4], v[o + 5]); }
    }
    return out;
  }
  function lin(c) { return Math.pow(Math.max(0, Math.min(1, c)), 2.2); }
  function label(e) { if (!e) return "rebar"; return (e.t === "room" ? (e.name || "Room") : e.t === "road" ? (e.name || "Road") : e.t === "asset" ? ((B.ASSET_LIB[e.kind] || {}).n || e.kind) : e.t) + " " + String(e.id).slice(0, 6); }

  /* ---------- GLB ---------- */
  B.exportGLB = function (doc, opts) {
    var M = groupsOf(doc, opts), json = { asset: { version: "2.0", generator: "Estimate Pro (Vividbrandify)" }, scene: 0, scenes: [{ name: doc.d.name || "Model", nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] }, chunks = [], off = 0, mats = {};
    function view(arr, target) { var bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - bytes.length % 4) % 4; chunks.push(bytes); if (pad) chunks.push(new Uint8Array(pad)); json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, target: target }); off += bytes.length + pad; return json.bufferViews.length - 1; }
    function mat(c) { var k = c.map(function (x) { return Math.round(x * 100); }).join("_"); if (mats[k] != null) return mats[k]; json.materials.push({ name: "m_" + k, pbrMetallicRoughness: { baseColorFactor: [lin(c[0]), lin(c[1]), lin(c[2]), c[3]], metallicFactor: 0, roughnessFactor: 0.8 }, alphaMode: c[3] < 0.99 ? "BLEND" : "OPAQUE", doubleSided: true }); return (mats[k] = json.materials.length - 1); }
    M.sc.groups.forEach(function (g) {
      if (!g.v.length) return; var parts = byMat(g), prims = [];
      Object.keys(parts).forEach(function (k) {
        var m = parts[k], n = m.p.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (var i = 0; i < n; i++) { var x = m.p[i * 3], y = m.p[i * 3 + 1], z = m.p[i * 3 + 2]; P[i * 3] = x; P[i * 3 + 1] = z; P[i * 3 + 2] = -y; N[i * 3] = m.n[i * 3]; N[i * 3 + 1] = m.n[i * 3 + 2]; N[i * 3 + 2] = -m.n[i * 3 + 1]; for (var c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], P[i * 3 + c]); mx[c] = Math.max(mx[c], P[i * 3 + c]); } }
        json.accessors.push({ bufferView: view(P, 34962), componentType: 5126, count: n, type: "VEC3", min: mn, max: mx }); var ap = json.accessors.length - 1;
        json.accessors.push({ bufferView: view(N, 34962), componentType: 5126, count: n, type: "VEC3" }); var an = json.accessors.length - 1;
        prims.push({ attributes: { POSITION: ap, NORMAL: an }, material: mat(m.col), mode: 4 });
      });
      var e = M.ents[g.id]; json.meshes.push({ name: label(e), primitives: prims }); json.nodes.push({ name: label(e), mesh: json.meshes.length - 1, extras: { estimatePro: { type: e ? e.t : "rebar", id: g.id } } }); json.scenes[0].nodes.push(json.nodes.length - 1);
    });
    json.buffers.push({ byteLength: off });
    var js = new TextEncoder().encode(JSON.stringify(json)), jpad = (4 - js.length % 4) % 4, total = 12 + 8 + js.length + jpad + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer), p = 0;
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); p = 12;
    dv.setUint32(p, js.length + jpad, true); dv.setUint32(p + 4, 0x4E4F534A, true); out.set(js, p + 8); for (var i = 0; i < jpad; i++) out[p + 8 + js.length + i] = 0x20; p += 8 + js.length + jpad;
    dv.setUint32(p, off, true); dv.setUint32(p + 4, 0x004E4942, true); p += 8; chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out.buffer;
  };

  /* ---------- OBJ + MTL ---------- */
  B.exportOBJ = function (doc, opts) {
    var M = groupsOf(doc, opts), base = (opts && opts.name) || "model", o = ["# Estimate Pro (Vividbrandify) — " + (doc.d.name || "") + " — metres, Y up", "mtllib " + base + ".mtl"], mtl = ["# materials"], mats = {}, vi = 1, ni = 1, f3 = function (x) { return (+x.toFixed(5)).toString(); };
    M.sc.groups.forEach(function (g) {
      if (!g.v.length) return; var parts = byMat(g), e = M.ents[g.id]; o.push("o " + label(e).replace(/\s+/g, "_"));
      Object.keys(parts).forEach(function (k) {
        var m = parts[k], name = "m_" + k; if (!mats[name]) { mats[name] = 1; mtl.push("newmtl " + name, "Kd " + m.col.slice(0, 3).map(function (x) { return f3(lin(x)); }).join(" "), "Ka 0 0 0", "d " + f3(m.col[3]), "illum 1", ""); }
        o.push("usemtl " + name); var n = m.p.length / 3;
        for (var i = 0; i < n; i++) { o.push("v " + f3(m.p[i * 3]) + " " + f3(m.p[i * 3 + 2]) + " " + f3(-m.p[i * 3 + 1])); o.push("vn " + f3(m.n[i * 3]) + " " + f3(m.n[i * 3 + 2]) + " " + f3(-m.n[i * 3 + 1])); }
        for (var t = 0; t < n; t += 3) o.push("f " + (vi + t) + "//" + (ni + t) + " " + (vi + t + 1) + "//" + (ni + t + 1) + " " + (vi + t + 2) + "//" + (ni + t + 2));
        vi += n; ni += n;
      });
    });
    return { obj: o.join("\n") + "\n", mtl: mtl.join("\n") + "\n" };
  };

  /* ---------- IFC4 ---------- */
  var B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  B.ifcGuid = function () { var b = new Uint8Array(16), i, bits = "0000"; if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); for (i = 0; i < 16; i++) bits += ("00000000" + b[i].toString(2)).slice(-8); var s = ""; for (i = 0; i < 22; i++) s += B64[parseInt(bits.substr(i * 6, 6), 2)]; return s; };
  function str(s) { s = String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "''"); return "'" + s.replace(/[^\x20-\x7E]/g, function (ch) { var c = ch.charCodeAt(0); return "\\X2\\" + ("0000" + c.toString(16).toUpperCase()).slice(-4) + "\\X0\\"; }) + "'"; }
  function num(x) { if (!isFinite(x)) x = 0; var s = (Math.round(x * 1e6) / 1e6).toString(); if (/e/.test(s)) s = x.toExponential(6).replace("e", "E"); return /[.E]/.test(s) ? s : s + "."; }
  var CLS = {
    wall: ["IFCWALL", ".STANDARD."], slab: ["IFCSLAB", ".FLOOR."], column: ["IFCCOLUMN", ".COLUMN."], beam: ["IFCBEAM", ".BEAM."], footing: ["IFCFOOTING", ".PAD_FOOTING."], roof: ["IFCROOF", ".NOTDEFINED."], stair: ["IFCSTAIR", ".NOTDEFINED."], railing: ["IFCRAILING", ".HANDRAIL."],
    road: ["IFCCIVILELEMENT"], culvert: ["IFCCIVILELEMENT"], land: ["IFCCIVILELEMENT"], model3d: ["IFCBUILDINGELEMENTPROXY", ".NOTDEFINED."]
  };
  B.exportIFC = function (doc, opts) {
    opts = opts || {}; var d = doc.d, bs = B.ensure(d), L = [], n = 0, M = groupsOf(doc, opts), G = B.ifcGuid;
    function add(s) { n++; L.push("#" + n + "=" + s + ";"); return "#" + n; }
    var org = add("IFCORGANIZATION($,'Vividbrandify',$,$,$)"), app = add("IFCAPPLICATION(" + org + ",'1.0','Estimate Pro','EstimatePro')");
    var person = add("IFCPERSON($,$," + str(opts.author || "Estimate Pro user") + ",$,$,$,$,$)"), po = add("IFCPERSONANDORGANIZATION(" + person + "," + org + ",$)");
    var oh = add("IFCOWNERHISTORY(" + po + "," + app + ",$,.ADDED.,$,$,$," + Math.floor(Date.now() / 1000) + ")");
    var u = [add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"), add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"), add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)"), add("IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)")], units = add("IFCUNITASSIGNMENT((" + u.join(",") + "))");
    var o0 = add("IFCCARTESIANPOINT((0.,0.,0.))"), zD = add("IFCDIRECTION((0.,0.,1.))"), xD = add("IFCDIRECTION((1.,0.,0.))"), ax = add("IFCAXIS2PLACEMENT3D(" + o0 + "," + zD + "," + xD + ")"), tn = add("IFCDIRECTION((0.,1.))");
    var ctx = add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05," + ax + "," + tn + ")"), body = add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*," + ctx + ",$,.MODEL_VIEW.,$)");
    var proj = add("IFCPROJECT('" + G() + "'," + oh + "," + str(d.name || "Estimate Pro model") + ",$,$,$,$,(" + ctx + ")," + units + ")");
    var sitePl = add("IFCLOCALPLACEMENT($," + ax + ")"), site = add("IFCSITE('" + G() + "'," + oh + ",'Site',$,$," + sitePl + ",$,$,.ELEMENT.,$,$,$,$,$)");
    var bPl = add("IFCLOCALPLACEMENT(" + sitePl + "," + ax + ")"), bld = add("IFCBUILDING('" + G() + "'," + oh + "," + str(opts.building || d.name || "Building") + ",$,$," + bPl + ",$,$,.ELEMENT.,$,$,$)");
    add("IFCRELAGGREGATES('" + G() + "'," + oh + ",$,$," + proj + ",(" + site + "))"); add("IFCRELAGGREGATES('" + G() + "'," + oh + ",$,$," + site + ",(" + bld + "))");
    var storeys = {}, sPl = add("IFCLOCALPLACEMENT(" + bPl + "," + ax + ")");
    bs.levels.slice().sort(function (a, b) { return a.elev - b.elev; }).forEach(function (lv) { storeys[lv.id] = { ref: add("IFCBUILDINGSTOREY('" + G() + "'," + oh + "," + str(lv.name) + ",$,$," + sPl + ",$,$,.ELEMENT.," + num(lv.elev / 1000) + ")"), els: [] }; });
    add("IFCRELAGGREGATES('" + G() + "'," + oh + ",$,$," + bld + ",(" + Object.keys(storeys).map(function (k) { return storeys[k].ref; }).join(",") + "))");
    var siteEls = [], elPl = add("IFCLOCALPLACEMENT(" + sPl + "," + ax + ")"), styles = {}, count = {};
    function style(c) { var k = c.map(function (x) { return Math.round(x * 100); }).join("_"); if (styles[k]) return styles[k]; var col = add("IFCCOLOURRGB($," + num(c[0]) + "," + num(c[1]) + "," + num(c[2]) + ")"), sh = add("IFCSURFACESTYLESHADING(" + col + "," + num(1 - c[3]) + ")"); return (styles[k] = add("IFCSURFACESTYLE($,.BOTH.,(" + sh + "))")); }
    M.sc.groups.forEach(function (g) {
      if (!g.v.length) return; var e = M.ents[g.id], parts = byMat(g), items = [];
      Object.keys(parts).forEach(function (k) {
        var m = parts[k], map = {}, pts = [], idx = [];
        for (var i = 0; i < m.p.length / 3; i++) { var x = m.p[i * 3], y = m.p[i * 3 + 1], z = m.p[i * 3 + 2], key = Math.round(x * 1e4) + "," + Math.round(y * 1e4) + "," + Math.round(z * 1e4); if (map[key] == null) { pts.push("(" + num(x) + "," + num(y) + "," + num(z) + ")"); map[key] = pts.length; } idx.push(map[key]); }
        var tri = []; for (var t = 0; t + 2 < idx.length; t += 3) if (idx[t] !== idx[t + 1] && idx[t + 1] !== idx[t + 2] && idx[t] !== idx[t + 2]) tri.push("(" + idx[t] + "," + idx[t + 1] + "," + idx[t + 2] + ")");
        if (!tri.length) return; var pl = add("IFCCARTESIANPOINTLIST3D((" + pts.join(",") + "),$)"), fs = add("IFCTRIANGULATEDFACESET(" + pl + ",$,$,(" + tri.join(",") + "),$)"); add("IFCSTYLEDITEM(" + fs + ",(" + style(m.col) + "),$)"); items.push(fs);
      });
      if (!items.length) return;
      var rep = add("IFCSHAPEREPRESENTATION(" + body + ",'Body','Tessellation',(" + items.join(",") + "))"), pds = add("IFCPRODUCTDEFINITIONSHAPE($,$,(" + rep + "))"), gid = "'" + G() + "'", nm = str(label(e)), head = gid + "," + oh + "," + nm + ",$,$," + elPl + "," + pds + ",$", ref;
      var t = e ? e.t : "rebar";
      if (!e) ref = add("IFCREINFORCINGBAR(" + head + ",$,$,$,$,.MAIN.,.TEXTURED.)");
      else if (t === "door" || t === "window") ref = add((t === "door" ? "IFCDOOR(" : "IFCWINDOW(") + head + "," + num((e.h || 2100) / 1000) + "," + num((e.w || 900) / 1000) + "," + (t === "door" ? ".DOOR." : ".WINDOW.") + ",.NOTDEFINED.,$)");
      else if (t === "room") ref = add("IFCSPACE(" + gid + "," + oh + "," + str(e.name || "Room") + ",$,$," + elPl + "," + pds + "," + str((e.floor || "") + " floor") + ",.ELEMENT.,.INTERNAL.,$)");
      else if (t === "asset") { var def = B.ASSET_LIB[e.kind] || {}; ref = add((def.cat === "Landscape" ? "IFCFURNISHINGELEMENT(" : "IFCFLOWTERMINAL(") + head + ")"); }
      else { var c = CLS[t] || ["IFCBUILDINGELEMENTPROXY", ".NOTDEFINED."]; ref = add(c[0] + "(" + head + (c[1] ? "," + c[1] : "") + ")"); }
      count[t] = (count[t] || 0) + 1;
      var lv = e && (e.lvl || (B.hostOf(doc, e) || {}).lvl); if (lv && storeys[lv]) storeys[lv].els.push(ref); else if (e && (t === "road" || t === "culvert" || t === "land")) siteEls.push(ref); else (storeys[bs.levels[0].id] || { els: siteEls }).els.push(ref);
      if (e && opts.qto !== false) {
        var q = []; B.qty(doc, e).forEach(function (r) { var nmq = str(r.label.slice(0, 120)); if (r.dim === "V") q.push(add("IFCQUANTITYVOLUME(" + nmq + ",$,$," + num(r.v / 1e9) + ",$)")); else if (r.dim === "A") q.push(add("IFCQUANTITYAREA(" + nmq + ",$,$," + num(r.v / 1e6) + ",$)")); else if (r.dim === "L") q.push(add("IFCQUANTITYLENGTH(" + nmq + ",$,$," + num(r.v / 1000) + ",$)")); else if (r.dim === "M") q.push(add("IFCQUANTITYWEIGHT(" + nmq + ",$,$," + num(r.v) + ",$)")); else if (r.dim === "N") q.push(add("IFCQUANTITYCOUNT(" + nmq + ",$,$," + num(r.v) + ",$)")); });
        if (q.length) { var qs = add("IFCELEMENTQUANTITY('" + G() + "'," + oh + ",'Qto_EstimatePro',$,'Estimate Pro',(" + q.join(",") + "))"); add("IFCRELDEFINESBYPROPERTIES('" + G() + "'," + oh + ",$,$,(" + ref + ")," + qs + ")"); }
      }
    });
    Object.keys(storeys).forEach(function (k) { var s = storeys[k]; if (s.els.length) add("IFCRELCONTAINEDINSPATIALSTRUCTURE('" + G() + "'," + oh + ",$,$,(" + s.els.join(",") + ")," + s.ref + ")"); });
    if (siteEls.length) add("IFCRELCONTAINEDINSPATIALSTRUCTURE('" + G() + "'," + oh + ",$,$,(" + siteEls.join(",") + ")," + site + ")");
    var now = new Date().toISOString().slice(0, 19), fn = (opts.name || "model") + ".ifc";
    var head = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');", "FILE_NAME(" + str(fn) + ",'" + now + "',(" + str(opts.author || "") + "),('Vividbrandify'),'Estimate Pro','Estimate Pro','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"];
    return { text: head.concat(L, ["ENDSEC;", "END-ISO-10303-21;"]).join("\n") + "\n", counts: count, entities: n };
  };
})();
