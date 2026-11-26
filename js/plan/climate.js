/* Building Planner — sun and wind check (central India, about 22° N; good for the whole of India in broad terms).
   Hot sides: west (afternoon sun, the hottest), then south (sun all day in winter, high in summer — easy to shade), east (morning),
   north (no direct sun — even daylight). Breeze: summer and monsoon winds mostly from the south-west / west, winter from the north-east. */
(function () {
  var EP = window.EP = window.EP || {}, PL = EP.plan = EP.plan || {};
  var AX = function (facing) { return { X: { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] }[facing || "S"], Y: { N: [0, -1], E: [-1, 0], S: [0, 1], W: [1, 0] }[facing || "S"] }; };
  var comp = function (v) { var a = (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360; return ["N", "E", "S", "W"][Math.round(a / 90) % 4]; };
  var HEAT = { W: 3, S: 2, E: 1, N: 0 }, HOT = ["Cool", "Mild", "Warm", "Hot"];
  var ADV = { W: "west wall: vertical fins or a jaali in front of the window, chajja 750 mm, light outside colour; keep windows small", S: "south wall: a 600 mm chajja over each window shades the summer sun and lets the winter sun in", E: "east wall: morning sun — fine for kitchen, pooja, dining; 450 mm chajja", N: "north wall: steady daylight without glare — big windows are fine" };
  PL.sunWind = function (o, facing) {
    var A = AX(facing), side = { f: comp([-A.Y[0], -A.Y[1]]), b: comp(A.Y), l: comp([-A.X[0], -A.X[1]]), r: comp(A.X) }, rooms = [], hot = [], noX = [], tot = 0, good = 0;
    o.floors.forEach(function (fl, fi) { fl.forEach(function (r) { var s2 = r.inst && r.inst.sp; if (!s2 || r.fill || r.pass || s2.unit || !/hab|hall|kit/.test(s2.win || "")) return;
      var el = PL.edgeLen(r, o.W, o.D), dirs = []; ["f", "b", "l", "r"].forEach(function (k) { if (el[k] >= 0.9) dirs.push(side[k]); }); if (!dirs.length) return;
      var h = Math.max.apply(null, dirs.map(function (d) { return HEAT[d]; })), cross = dirs.length >= 2; tot++; if (cross) good++;
      var item = { fl: fi, name: r.name, dirs: dirs, heat: HOT[h], cross: cross, bed: /bed|master|guest|elders|ward|room/.test(r.key + " " + r.name.toLowerCase()) };
      if (h === 3 && item.bed && dirs.length === 1) hot.push(r.name + (fi ? " (floor " + fi + ")" : "")); if (!cross && s2.win !== "kit") noX.push(r.name + (fi ? " (floor " + fi + ")" : ""));
      rooms.push(item); }); });
    var longFront = o.W >= o.D, longFaces = longFront ? [side.f, side.b] : [side.l, side.r], ns = longFaces.indexOf("N") >= 0 || longFaces.indexOf("S") >= 0;
    var notes = [];
    notes.push(ns ? "Good: the long sides face north and south — less low east / west sun on the walls." : "The long sides face east and west — the hot afternoon sun falls on a long wall; shade the west side well (fins, jaali, trees, a verandah).");
    if (hot.length) notes.push("Bed rooms with only a west wall (hot evenings): " + hot.join(", ") + " — swap with a store / stair / toilet, or shade the window well.");
    notes.push("Cross ventilation: " + good + " of " + tot + " rooms have windows on two sides" + (noX.length ? "; one-sided: " + noX.slice(0, 6).join(", ") + (noX.length > 6 ? " …" : "") + " — a ventilator high on the inner wall or a door kept open helps" : "") + ".");
    notes.push("Breeze: summer and monsoon winds come mostly from the south-west / west — windows on the " + [side.f, side.b, side.l, side.r].filter(function (d) { return d === "S" || d === "W"; }).concat(["(none)"])[0] + " side catch them; winter winds from the north-east.");
    var walls = {}; ["f", "b", "l", "r"].forEach(function (k) { walls[side[k]] = ADV[side[k]]; });
    return { rooms: rooms, notes: notes, walls: walls, side: side, hot: hot, cross: tot ? Math.round(good / tot * 100) : 0 };
  };
  /* sun path at 22° N for 21 June, 21 March and 21 December, drawn over the building outline (north up) */
  PL.sunSVG = function (o, facing, lat) {
    lat = (lat || 22) * Math.PI / 180; var R = 110, cx = 130, cy = 130, A = AX(facing), out = [];
    var pos = function (decl, hr) { var d = decl * Math.PI / 180, H = (hr - 12) * 15 * Math.PI / 180, alt = Math.asin(Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(H)); if (alt < 0) return null;
      var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(d) * Math.cos(lat)) + Math.PI, rr = R * (1 - alt / (Math.PI / 2)); return [cx + rr * Math.sin(az), cy - rr * Math.cos(az), hr]; };
    [[23.44, "#e65100", "21 Jun"], [0, "#f9a825", "21 Mar / Sep"], [-23.44, "#1565c0", "21 Dec"]].forEach(function (s) { var pts = []; for (var h = 5; h <= 19; h += 0.25) { var p = pos(s[0], h); if (p) pts.push(p); }
      out.push("<polyline fill='none' stroke='" + s[1] + "' stroke-width='2' points='" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + "'/>");
      pts.filter(function (p) { return Math.abs(p[2] - Math.round(p[2])) < 0.01 && Math.round(p[2]) % 3 === 0; }).forEach(function (p) { out.push("<circle cx='" + p[0].toFixed(1) + "' cy='" + p[1].toFixed(1) + "' r='2.5' fill='" + s[1] + "'/><text x='" + (p[0] + 3).toFixed(1) + "' y='" + (p[1] - 3).toFixed(1) + "' font-size='8' fill='" + s[1] + "'>" + Math.round(p[2]) + "</text>"); });
      out.push("<text x='4' y='" + (14 + 11 * ["21 Jun", "21 Mar / Sep", "21 Dec"].indexOf(s[2])) + "' font-size='9' fill='" + s[1] + "'>— " + s[2] + "</text>"); });
    /* the building, turned so that north is up */
    var sc = 60 / Math.max(o.W, o.D), ol = o.outline || [[0, 0], [o.W, 0], [o.W, o.D], [0, o.D]], c = [o.W / 2, o.D / 2];
    var map = function (q) { var dx = q[0] - c[0], dy = q[1] - c[1], e = dx * A.X[0] + dy * A.Y[0], n = dx * A.X[1] + dy * A.Y[1]; return [cx + e * sc, cy - n * sc]; };
    out.push("<polygon fill='#90a4ae' fill-opacity='.5' stroke='#37474f' points='" + ol.map(function (q) { var m = map(q); return m[0].toFixed(1) + "," + m[1].toFixed(1); }).join(" ") + "'/>");
    var rd = map([o.W / 2, -2.5]); out.push("<text x='" + rd[0].toFixed(1) + "' y='" + rd[1].toFixed(1) + "' font-size='8' text-anchor='middle' fill='#37474f'>road</text>");
    var ring = "<circle cx='" + cx + "' cy='" + cy + "' r='" + R + "' fill='#fffde7' stroke='#bbb'/><circle cx='" + cx + "' cy='" + cy + "' r='" + R * 2 / 3 + "' fill='none' stroke='#ddd'/><circle cx='" + cx + "' cy='" + cy + "' r='" + R / 3 + "' fill='none' stroke='#ddd'/>" +
      [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]].map(function (k) { return "<text x='" + (cx + k[1] * (R + 9)) + "' y='" + (cy + k[2] * (R + 9) + 3) + "' font-size='10' font-weight='700' text-anchor='middle'>" + k[0] + "</text>"; }).join("");
    var wind = "<g stroke='#00838f' stroke-width='2' fill='#00838f'><line x1='" + (cx - R * 0.95) + "' y1='" + (cy + R * 0.95) + "' x2='" + (cx - R * 0.62) + "' y2='" + (cy + R * 0.62) + "'/><polygon points='" + (cx - R * 0.6) + "," + (cy + R * 0.6) + " " + (cx - R * 0.68) + "," + (cy + R * 0.62) + " " + (cx - R * 0.62) + "," + (cy + R * 0.68) + "'/></g><text x='" + (cx - R * 0.95) + "' y='" + (cy + R * 1.05 + 8) + "' font-size='8' fill='#00838f'>summer / monsoon breeze</text>";
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 270' width='260' height='270'>" + ring + out.join("") + wind + "</svg>";
  };
})();
