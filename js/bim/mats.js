/* Estimate Pro BIM — 3D looks (visual materials) and sun position.
   A "look" is how a surface appears in 3D: base colour + a procedural pattern drawn by the 3D viewer's shader
   (brick bond, blocks, stone, tiles, wood, sheet ribs…), its scale and gloss. No image textures are downloaded,
   so the 3D view works offline. Looks do not change quantities — the SOR items still come from the element data.
   Building defaults: d.bim.looks[category] = { l: look id, c: "#rrggbb" (optional colour) }.
   Element overrides: wall lookO / colO (outer face), lookI / colI (inner face); other elements look / col. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim;
  /* pattern ids understood by the shader (view3d.js) */
  var PT = { plain: 0, brick: 1, block: 2, stone: 3, concrete: 4, paint: 5, tile: 6, wood: 7, sheet: 8, rooftile: 9, grass: 10, granite: 11, glass: 12, marble: 13, paver: 14, soil: 15, emit: 16, water: 17 };
  B.PT = PT;
  /* s = pattern size in metres (tile size, plank width…); g = gloss 0–1; a = opacity */
  B.LOOKS = {
    paint_white: { n: "Paint — white", c: "#eeebe3", p: PT.paint, g: 0.08 },
    paint_cream: { n: "Paint — cream", c: "#e8d9b0", p: PT.paint, g: 0.08 },
    paint_peach: { n: "Paint — peach", c: "#e9c2a0", p: PT.paint, g: 0.08 },
    paint_grey: { n: "Paint — light grey", c: "#c9c9c4", p: PT.paint, g: 0.08 },
    paint_blue: { n: "Paint — sky blue", c: "#a9c6dc", p: PT.paint, g: 0.08 },
    paint_green: { n: "Paint — pista green", c: "#c5d8a6", p: PT.paint, g: 0.08 },
    paint_terracotta: { n: "Paint — terracotta", c: "#b8674a", p: PT.paint, g: 0.08 },
    plaster: { n: "Cement plaster (unpainted)", c: "#c9c3b5", p: PT.paint, g: 0.04 },
    brick: { n: "Exposed brick", c: "#a4533a", p: PT.brick, s: 1, g: 0.04 },
    block: { n: "Concrete / AAC block", c: "#b2b1ab", p: PT.block, s: 1, g: 0.04 },
    stone: { n: "Stone masonry", c: "#8d8170", p: PT.stone, s: 1, g: 0.05 },
    concrete: { n: "Concrete (fair face)", c: "#b7b5ae", p: PT.concrete, g: 0.06 },
    tile_vitrified: { n: "Vitrified tiles 600×600", c: "#ddd4c3", p: PT.tile, s: 0.6, g: 0.55 },
    tile_ceramic: { n: "Ceramic tiles 300×300", c: "#cfc5b2", p: PT.tile, s: 0.3, g: 0.4 },
    tile_wall: { n: "Glazed wall tiles 300×450", c: "#e6e4dc", p: PT.tile, s: 0.3, g: 0.6 },
    kota: { n: "Kota stone", c: "#7d8a83", p: PT.tile, s: 0.6, g: 0.3 },
    granite: { n: "Granite (black)", c: "#3c3b3d", p: PT.granite, s: 0.6, g: 0.65 },
    marble: { n: "Marble (white)", c: "#ebe8e1", p: PT.marble, s: 0.6, g: 0.6 },
    ips: { n: "IPS / cement concrete floor", c: "#a09c93", p: PT.concrete, g: 0.12 },
    wood: { n: "Wood (teak)", c: "#8a5a2b", p: PT.wood, s: 0.15, g: 0.3 },
    wood_light: { n: "Wood (light / flush)", c: "#b98a55", p: PT.wood, s: 0.25, g: 0.25 },
    sheet_gi: { n: "Metal sheet — grey / GI", c: "#7d929f", p: PT.sheet, s: 0.076, g: 0.55 },
    sheet_red: { n: "Metal sheet — red", c: "#a3392c", p: PT.sheet, s: 0.076, g: 0.45 },
    sheet_green: { n: "Metal sheet — green", c: "#3f6d4b", p: PT.sheet, s: 0.076, g: 0.45 },
    sheet_blue: { n: "Metal sheet — blue", c: "#2f5d8a", p: PT.sheet, s: 0.076, g: 0.45 },
    rooftile: { n: "Clay roof tiles", c: "#a6482a", p: PT.rooftile, s: 0.2, g: 0.2 },
    aluminium: { n: "Aluminium", c: "#c3c7cc", p: PT.plain, g: 0.75 },
    steel: { n: "Steel (painted grey)", c: "#646e76", p: PT.plain, g: 0.5 },
    steel_black: { n: "Steel (painted black)", c: "#2c2e31", p: PT.plain, g: 0.5 },
    upvc: { n: "uPVC (white)", c: "#f1f1ee", p: PT.plain, g: 0.35 },
    glass: { n: "Glass (clear)", c: "#9ec7de", p: PT.glass, g: 0.95, a: 0.35 },
    water: { n: "Water — pool / pond (blue)", c: "#2f86b0", p: PT.water, g: 0.9 }, water_green: { n: "Water — pond (green)", c: "#3f8f7a", p: PT.water, g: 0.85 }, water_deep: { n: "Water — deep (dark blue)", c: "#1f5f8e", p: PT.water, g: 0.9 },
    glass_tint: { n: "Glass (tinted)", c: "#4f6f80", p: PT.glass, g: 0.95, a: 0.55 },
    grass: { n: "Grass", c: "#6b8c4a", p: PT.grass, g: 0.02 },
    soil: { n: "Soil / murrum", c: "#8c7356", p: PT.soil, g: 0.02 },
    paver: { n: "Paver blocks", c: "#c4946a", p: PT.paver, s: 0.2, g: 0.12 },
    paver_red: { n: "Paver blocks — red", c: "#b85c3a", p: PT.paver, s: 0.2, g: 0.12 },
    paver_grey: { n: "Paver blocks — grey", c: "#8a8d90", p: PT.paver, s: 0.2, g: 0.12 },
    paver_yellow: { n: "Paver blocks — yellow", c: "#d4a84a", p: PT.paver, s: 0.2, g: 0.12 },
    asphalt: { n: "Bitumen road", c: "#4a4a4c", p: PT.concrete, g: 0.08 },
    /* ACP / cladding panels */
    acp_silver: { n: "ACP panel — silver", c: "#b8bcc2", p: PT.plain, g: 0.82 },
    acp_champagne: { n: "ACP panel — champagne gold", c: "#c9a96e", p: PT.plain, g: 0.78 },
    acp_charcoal: { n: "ACP panel — charcoal", c: "#3c3e42", p: PT.plain, g: 0.75 },
    acp_red: { n: "ACP panel — red", c: "#a22c2c", p: PT.plain, g: 0.72 },
    acp_blue: { n: "ACP panel — royal blue", c: "#1e4278", p: PT.plain, g: 0.72 },
    acp_white: { n: "ACP panel — white", c: "#f0eff0", p: PT.plain, g: 0.80 },
    /* wall panel / cladding */
    hpl_wood: { n: "HPL panel — wood grain", c: "#8a5e32", p: PT.wood, s: 0.3, g: 0.45 },
    hpl_white: { n: "HPL panel — white", c: "#f0eee8", p: PT.plain, g: 0.55 },
    wpc_brown: { n: "WPC wall panel — brown", c: "#6b4628", p: PT.wood, s: 0.18, g: 0.3 },
    wpc_grey: { n: "WPC wall panel — grey", c: "#787878", p: PT.wood, s: 0.18, g: 0.25 },
    stone_cladding: { n: "Stone cladding (natural)", c: "#a89878", p: PT.stone, s: 0.4, g: 0.25 },
    stone_cladding_w: { n: "Stone cladding (white)", c: "#e2ddd5", p: PT.stone, s: 0.4, g: 0.3 },
    /* furniture / appliance materials */
    fabric_grey: { n: "Fabric — grey", c: "#7d7d7d", p: PT.plain, g: 0.05 },
    fabric_blue: { n: "Fabric — blue", c: "#4a6a8c", p: PT.plain, g: 0.05 },
    fabric_brown: { n: "Fabric — brown", c: "#6e4c32", p: PT.plain, g: 0.05 },
    laminate_white: { n: "Laminate — white", c: "#f2f0ea", p: PT.plain, g: 0.45 },
    laminate_beige: { n: "Laminate — beige", c: "#d4c9b0", p: PT.plain, g: 0.4 },
    chrome: { n: "Chrome / SS mirror", c: "#d8dce0", p: PT.plain, g: 0.92 },
    porcelain: { n: "Porcelain (white)", c: "#f6f6f2", p: PT.plain, g: 0.7 }
  };
  /* building-wide categories: [key, label, default look] */
  B.LOOK_CATS = [
    ["wall_ext", "Walls — outer face of exterior walls", "paint_cream"],
    ["wall_int", "Walls — inner faces", "paint_white"],
    ["frame", "Columns and beams", "paint_cream"],
    ["slab", "Slab top and edges", "concrete"],
    ["ceiling", "Slab underside (ceiling)", "paint_white"],
    ["roof_rcc", "Flat RCC roof", "concrete"],
    ["roof_sheet", "Sheet roof (GI / colour coated / PUF)", "sheet_gi"],
    ["roof_tile", "Tiled roof", "rooftile"],
    ["door", "Door shutters", "wood_light"],
    ["door_frame", "Door frames", "wood"],
    ["win_frame", "Window frames", "aluminium"],
    ["glass", "Glass", "glass"],
    ["stair", "Stairs", "kota"],
    ["rail", "Railings", "steel"],
    ["found", "Footings / PCC", "concrete"],
    ["ground", "Ground around the building", "grass"],
    ["road_surface", "Road surface", "asphalt"],
    ["road_shoulder", "Road shoulders", "soil"],
    ["road_fill", "Embankment slopes", "grass"],
    ["road_cut", "Cutting slopes", "soil"],
    ["elevation", "Elevation cladding / ACP", "acp_silver"],
    ["parapet", "Parapet wall", "paint_cream"],
    ["boundary", "Boundary wall", "paint_cream"]
  ];
  var FLOOR = { vitrified: "tile_vitrified", ceramic: "tile_ceramic", kota: "kota", granite: "granite", ips: "ips", marble: "marble", "": "ips" };
  B.FLOOR_LOOK = FLOOR;
  var MATLOOK = { gi: "sheet_gi", puf: "sheet_gi", tile: "rooftile", flush: "wood_light", wood: "wood", pvc: "upvc", steel: "steel", al: "aluminium", upvc: "upvc" };
  B.MAT_LOOK = MATLOOK;

  function hex(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); var n = parseInt(h, 16); if (!/^[0-9a-f]{6}$/i.test(h)) return null; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  B.hex = hex;
  B.toHex = function (c) { return "#" + c.map(function (x) { var s = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16); return s.length < 2 ? "0" + s : s; }).join(""); };
  /* building defaults with any missing category filled */
  B.looks = function (d) { var bs = B.ensure(d); if (!bs.looks) bs.looks = {}; return bs.looks; };
  B.catLook = function (d, cat) { var L = (B.ensure(d).looks || {})[cat] || {}, def = (B.LOOK_CATS.filter(function (x) { return x[0] === cat; })[0] || [])[2]; return { l: B.LOOKS[L.l] ? L.l : def, c: L.c || null }; };
  /* a resolved look as a colour array the mesh builder understands: [r,g,b] with .p pattern, .s size, .g gloss, .a opacity */
  B.look = function (id, colHex) {
    var L = B.LOOKS[id] || B.LOOKS.plaster, c = hex(colHex) || hex(L.c), out = c.slice();
    out.p = L.p; out.s = L.s || 1; out.g = L.g || 0; out.a = L.a == null ? 1 : L.a; out.id = id; return out;
  };
  /* look of a category, unless the element carries its own (id / colour) */
  B.lookFor = function (d, cat, elId, elCol) { var cl = B.catLook(d, cat); return B.look(elId && B.LOOKS[elId] ? elId : cl.l, elCol || (elId && B.LOOKS[elId] ? null : cl.c)); };
  B.lookOptions = function (filter) { return Object.keys(B.LOOKS).filter(function (k) { return !filter || filter(k, B.LOOKS[k]); }).map(function (k) { return [k, B.LOOKS[k].n]; }); };

  /* ---------- sun ---------- */
  /* site defaults: SECL headquarters, Bilaspur (Chhattisgarh); IST = UTC + 5:30 */
  B.SUN0 = { mode: "time", date: "", t: 10.5, az: 135, el: 50, lat: 22.09, lng: 82.15, tz: 5.5, north: 0 };
  B.sunCfg = function (d) { var bs = B.ensure(d); bs.sun = Object.assign({}, B.SUN0, bs.sun || {}); return bs.sun; };
  /* true solar azimuth (degrees clockwise from north) and elevation for a date (YYYY-MM-DD), local clock time (hours) and place.
     NOAA-style approximation: good to about half a degree, enough for shadow studies. */
  B.solar = function (dateStr, hours, lat, lng, tz) {
    var dt = dateStr ? new Date(dateStr + "T00:00:00Z") : new Date(), y = dt.getUTCFullYear(), start = Date.UTC(y, 0, 1), N = Math.floor((Date.UTC(y, dt.getUTCMonth(), dt.getUTCDate()) - start) / 864e5) + 1;
    var g = 2 * Math.PI / 365 * (N - 1 + (hours - 12) / 24);
    var eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var tst = hours * 60 + eot + 4 * lng - 60 * tz, ha = (tst / 4 - 180) * Math.PI / 180, phi = lat * Math.PI / 180;
    var cz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha), zen = Math.acos(Math.max(-1, Math.min(1, cz)));
    var az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * 180 / Math.PI + 180;
    return { az: (az + 360) % 360, el: 90 - zen * 180 / Math.PI };
  };
  /* sun for the 3D view, in drawing directions (az measured clockwise from drawing "up") */
  B.sunNow = function (d, ov) {
    var s = Object.assign({}, B.sunCfg(d), ov || {});
    if (s.mode === "manual") return { az: s.az, el: s.el };
    var r = B.solar(s.date || new Date().toISOString().slice(0, 10), s.t, s.lat, s.lng, s.tz);
    return { az: (r.az + (s.north || 0) + 360) % 360, el: r.el, trueAz: r.az };
  };
})();
