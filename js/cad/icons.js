/* Estimate Pro CAD Studio — line icons for the ribbon (24 × 24, stroke = currentColor). Commands without their own icon get a lettered tile. */
(function () {
  "use strict";
  var CAD = (window.EP = window.EP || {}).cad = window.EP.cad || {};
  var I = {
    LINE: "M4 20L20 4M4 20h0M20 4h0", PLINE: "M3 19l5-9 5 6 4-11 4 4", RECTANG: "M4 6h16v12H4z", CIRCLE: "M12 4a8 8 0 1 0 0.01 0z", ARC: "M4 18a10 10 0 0 1 16 0", POLYGON: "M12 3l8 6-3 10H7L4 9z",
    ELLIPSE: "M12 7c5 0 9 2.2 9 5s-4 5-9 5-9-2.2-9-5 4-5 9-5z", SPLINE: "M3 17c3-10 6 6 9-2s6-8 9-3", XLINE: "M2 22L22 2M12 12h0", POINT: "M12 12h0M8 12h8M12 8v8", HATCH: "M4 4h16v16H4zM4 12l8-8M4 20L20 4M12 20l8-8", BOUNDARY: "M5 5h14v14H5zM9 9h6v6H9z",
    MOVE: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3", COPY: "M8 8h11v11H8zM5 16V5h11", ROTATE: "M20 12a8 8 0 1 1-3-6.2M20 4v5h-5", SCALE: "M4 20h7v-7H4zM11 13l8-8M14 5h5v5",
    MIRROR: "M12 3v18M4 7l5 5-5 5zM20 7l-5 5 5 5z", OFFSET: "M4 18c4-10 12-10 16 0M4 13c4-7 12-7 16 0", TRIM: "M4 12h16M12 4v6M12 14v6M9 9l6 6", EXTEND: "M4 12h12M20 4v16M14 9l3 3-3 3", FILLET: "M4 20V12a8 8 0 0 1 8-8h8",
    CHAMFER: "M4 20v-9l7-7h9", ARRAY: "M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z", STRETCH: "M3 8h10v8H3zM13 12h8M18 9l3 3-3 3", BREAK: "M3 12h7M14 12h7M10 9l4 6", JOIN: "M3 12h18M10 9v6M14 9v6", EXPLODE: "M12 12l-6-6M12 12l6-6M12 12l-6 6M12 12l6 6M4 4h3M17 4h3M4 20h3M17 20h3",
    MATCHPROP: "M4 20l9-9M13 11l3-7 4 4-7 3", ERASE: "M7 21h10M5 13l8-8 6 6-8 8H8z", TEXT: "M5 5h14M12 5v15", MTEXT: "M4 5h16M4 10h16M4 15h10M4 20h12", DIMLINEAR: "M4 8v10M20 8v10M4 13h16M4 13l3-2M4 13l3 2M20 13l-3-2M20 13l-3 2",
    DIMALIGNED: "M4 18L18 4M7 21L21 7M5.5 19.5l2-2", DIMCONTINUE: "M3 8v10M12 8v10M21 8v10M3 13h18", DIMBASELINE: "M3 6v14M12 12v8M21 6v14M3 16h9M3 10h18", DIMANGULAR: "M4 20L20 20M4 20L16 6M14 20a10 10 0 0 0-4-8", DIMRADIUS: "M12 12a8 8 0 1 0 0.01 0zM12 12l6-5",
    DIMDIAMETER: "M12 4a8 8 0 1 0 0.01 0zM6 18L18 6", DIMORDINATE: "M4 4v16h16M8 20v-6h8", LEADER: "M4 20l8-8h8M4 20l1-4M4 20l4-1",
    BLOCK: "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7z", INSERT: "M12 3v12M8 11l4 4 4-4M4 19h16", GROUP: "M3 3h18v18H3zM7 7h4v4H7zM13 13h4v4h-4z", UNGROUP: "M7 7h4v4H7zM13 13h4v4h-4zM3 3h4M17 3h4M3 21h4M17 21h4", DRAWORDER: "M4 4h10v10H4zM10 10h10v10H10z",
    DIST: "M3 17h18M3 14v6M21 14v6M7 9l5-5 5 5", AREA: "M4 4h16v16H4zM8 8l8 8M8 16l8-8", LIST: "M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0", DIVIDE: "M3 12h18M7 9v6M12 9v6M17 9v6", MEASURE: "M3 16h18v4H3zM7 16v-3M11 16v-3M15 16v-3M19 16v-3", TAKEOFF: "M4 4h11l5 5v11H4zM8 13h8M8 17h5M14 4v5h6",
    ZOOM: "M10 4a6 6 0 1 0 0.01 0zM14.5 14.5L21 21M7 10h6M10 7v6", PAN: "M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4", ISOLATE: "M12 5c-6 0-9 7-9 7s3 7 9 7 9-7 9-7-3-7-9-7zM12 9a3 3 0 1 0 0.01 0z", UNISOLATE: "M3 3l18 18M12 5c-6 0-9 7-9 7s1 2.3 3.3 4.3M12 19c6 0 9-7 9-7s-1-2.3-3.3-4.3", REGEN: "M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4",
    WALL: "M3 7h18v4H3zM3 13h18v4H3zM9 7v4M15 13v4M6 13v4", DOOR: "M5 20h14M7 20V5h7v15M12 13h0", WINDOW: "M4 5h16v14H4zM12 5v14M4 12h16", OPENING: "M3 8h6v8H3zM15 8h6v8h-6zM9 16h6", COLUMN: "M7 3h10v18H7zM7 3l10 18M17 3L7 21",
    BEAM: "M2 9h20v6H2zM2 9l4 6M8 9l4 6M14 9l4 6", SLAB: "M2 14l8-6h12l-8 6zM2 14v3h12v-3M14 17l8-6v-3", FOOTING: "M9 3h6v9H9zM4 12h16v6H4zM2 21h20", ROOF: "M2 13L12 4l10 9M5 11v9h14v-9", STAIR: "M3 21h4v-4h4v-4h4v-4h4V5h2", ROOM: "M4 4h16v16H4zM8 12h8M12 8v8",
    RAILING: "M3 7h18M5 7v13M10 7v13M15 7v13M20 7v13", REBAR: "M4 6h16M4 12h16M4 18h16M7 3v18M17 3v18", BBS: "M4 4h16v16H4zM4 9h16M9 9v11M4 14h16",
    ROAD: "M8 3L4 21M16 3l4 18M12 4v3M12 10v3M12 16v3", CULVERT: "M3 14h18M6 14a6 6 0 0 1 12 0M3 18h18", EARTHWORK: "M2 18l5-6 4 3 5-8 6 11zM2 21h20",
    ASSET: "M12 3a5 5 0 0 1 3 9h-6a5 5 0 0 1 3-9zM12 12v9M8 21h8", LANDAREA: "M3 20h18M5 20c0-4 2-6 3-9 1 3 3 5 3 9M13 20c0-3 1.5-5 2.5-7 1 2 2.5 4 2.5 7"
  };
  CAD.ICONS = I;
  CAD.icon = function (cmd, label) {
    var d = I[cmd]; if (!d) { var t = String(label || cmd).replace(/[^A-Za-z0-9]/g, "").slice(0, 2); return "<svg viewBox='0 0 24 24' width='22' height='22' aria-hidden='true'><rect x='3' y='3' width='18' height='18' rx='4' fill='none' stroke='currentColor' stroke-width='1.6'/><text x='12' y='16' text-anchor='middle' font-size='9' font-weight='700' fill='currentColor' font-family='sans-serif'>" + t + "</text></svg>"; }
    return "<svg viewBox='0 0 24 24' width='22' height='22' aria-hidden='true'><path d='" + d + "' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>";
  };
})();
