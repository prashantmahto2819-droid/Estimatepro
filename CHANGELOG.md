# Estimate Pro — change log (CAD Studio / 3D)

This file is for the people maintaining the app. It is not published with the site (see `.assetsignore`).
The text users see is `EP_NOTES` in `js/version.js`.

## 2026.11.21-z18
- Reflections on water: after the scene pass the frame (colour + depth) is copied to `rfFBO` (units 9 / 10); the next frame's water fragments march their mirrored ray on that copy (`ssr`, 26 growing steps, thickness test on linear depth, fade at the screen edge and with distance). One extra frame is drawn after the view changes. Only when the scene has pattern-17 vertices (`_hasWater`), Realistic style, perspective; `reflect = false` switches it off (also set if the copy fails).
- **Fix**: look id `water` already existed (dsmodel.js, a glass look) and replaced the new one, so z8's water was plain glass. New ids `water_pool`; the land kind uses it.
- Cut-out people bob by 35 mm per step while walking.

## 2026.11.21-z17
- Main shader `uSecFill`: when a cut or section box is on, back faces of opaque surfaces (not grass / water) are drawn as hatched cut material. Shadow pass: `uCutS` / `uBoxS` discard what is cut away, so it throws no shadow.

## 2026.11.21-z16
- Light fittings and walls: `ui-bim.js` `wallMask` paints walls (less `opening` elements) and columns of up to four storeys into a 512 px canvas (2 × 2 tiles); `view3d.js` `setWallMask` (texture unit 8) and `wmSee` in the main shader march from the fragment to each fitting in plan (steps shorter than a wall, at most 48) and stop the light at a wall or when the storeys differ. Only run for lights whose share is above 0.012. `lightThru` (💡 Fast lights) switches it off.
- Known limits: doors and windows block the light (no spill outside through glass), stair wells do not pass light between floors, more than four storeys → the upper ones are not checked.

## 2026.11.21-z15
- **Fix** `dxf.js`: building elements were never written to DXF (`ent()` had no case for them) — now their plan (`B.plan` segs and dashed) goes out as LINE / ARC / CIRCLE, DASHED linetype added to the table.
- `dxf.js` `opts.realDims` (menu "Export DXF with real dimensions (trial)"): anonymous blocks `*Dn` + DIMENSION entities for linear / aligned dimensions. Reads back in our own importer; not yet checked in AutoCAD.
- `site.js`: type `steps` (STEPS; `B.stepsInfo`; qty brick / pcc_floor / rcc_slab), ramp `cross` (cross fall).
- `roofs2.js`: dome `shape: "pyr"` with `sides`. `hatch.js`: STONE, RUBBLE.

## 2026.11.21-z14
- `runs.js`: drain `slope` (1 in N → average trench depth) and `mh` (spacing in m → `manhole` rows, CPWD 19.7.1.1); Properties show the depths at both ends.
- `site.js` CONTOURS: pieces chained end to end per level, two passes of corner cutting, written as polylines.
- `roofs2.js`: dome `ring` (ring beam: mesh + rcc_beam / shut_beam rows).
- `views2d.js`: detail inserts carry `det` (the window); `B.refreshDetails`; VIEWSUPDATE and `B.refreshViews` also refresh details and all schedule kinds.
- Text `font` ("times", "courier"): canvas font and PDF fonts F5–F12 (image objects now start at 17 in the single-page PDF).

## 2026.11.21-z13
- New `js/cad/libs.js`: BLOCKKEEP / BLOCKLIB (localStorage `ep_blocklib`, nested blocks carried in `sub`), HATCHLOAD (`CAD.parsePat`; patterns in localStorage `ep_pats` and in the drawing's `d.pats`, registered on open through `CAD.HOOKS.wire`; built-in names are never replaced).
- `ui-bim.js`: wall move — `follow` lists the corners of rooms / slabs / roofs within the wall's half thickness (+ overhang for slabs and roofs) and shifts them with the wall.
- Windows app: `desktop/` (Electron) + `.github/workflows/windows-app.yml`; first build succeeded on 21 Nov (run 44895805494). The repository is public — told the owner.

## 2026.11.21-z12
- Room `fl` (floor offset): mesh platform + finish at the offset; rows `backfill` and `brick` (115 mm edge wall) when raised.
- `views2d.js`: DETAILVIEW — `prims` turns the entities in a window into plain lines / arcs (BIM through `B.plan`), lines clipped at the window, block `DET-<mark>` inserted at k = sheet scale / detail scale; marks on layer A-DETAIL. A snapshot, not live.
- `ui-bim.js`: walls in Move mode — `applyMv` shifts the wall along its normal and the linked ends of walls that meet it (corners and T-junctions).

## 2026.11.21-z11
- `ui-bim.js`: hosted elements in Move mode — `mvEnt` changes `at` by the drag projected on the wall direction (25 mm steps, kept inside the wall).
- `site.js`: ramp `rail` (posts at about 1.2 m, top and mid rail following the slope; `railing` row 2 × slope length).

## 2026.11.21-z10
- Text entity `st` ("b", "i", "bi"): canvas font, PDF fonts F3 (Helvetica-Oblique) and F4 (Helvetica-BoldOblique) — image objects now start at 9; TEXT / MTEXT option Style (`ed.txtSt`); Properties select.
- Movers: `uFlip` in the main and shadow vertex shaders; `_drawMovers` runs out and back (pivot = centre of the vehicle's own vertices).

## 2026.11.21-z9
- `views2d.js`: tags carry `sw` (opening rectangle, hinge side from `swing` and the wall direction in the view, two leaves) → V marks on A-ELEV-LVL; `notes` (building default looks of wall_ext / roof / win_frame / door) written under the scale line of elevations.
- `templates.json` + `B.NSMAP`: DG set 125 kVA, transformer 250 kVA, main LT panel, garden fountain (budget figures).
- Owner ran `server/devices.sql` on 21 Nov — device limits are live on the server from then (not verified from here).

## 2026.11.21-z8
- Pattern 17 `water` (`B.PT.water`): fbm ripples tilt the normal; reflection as strong as glass. Looks `water`, `water_green`, `water_deep`; land kind `water` (no quantity rows); LANDAREA offers Water.

## 2026.11.21-z7
- `site.js`: CUTFILL (`B.cutFill`: prisms over the Delaunay triangles, mixed triangles subdivided 5 levels); height check in AREASTATEMENT.
- `runs.js`: drain runs add `excavation` / `backfill` rows (trench = pipe + 600 wide, depth = |z|; `trench: false` switches it off); unit kind `kitchen_appl_bay` (row type `ap`; only the counter is measured).
- Head `point` (equilateral pointed arch): `B.archSp` 0.2518 w², mesh profile, Properties, schedule text.

## 2026.11.21-z6
- `site.js`: CONTOURS (Bowyer–Watson `delaunay`, `B.spotPoints`; spot texts now carry `spot` and `sp`; layer C-TOPO-CONT); AREASTATEMENT asks permitted coverage / FAR and writes OK / EXCEEDS.
- `runs.js`: services `drain_sw_100/150/200` (CPWD 19.1.1–3), `drain_rcc_150/250/300/450` (19.6.2–5), `wire_15/25/40/60` (E&M 1.14.1–4).
- `ui-bim.js`: `colFam` + colour chips (`data-matcol`, `C.matCol`) in the Paint popup.

## 2026.11.21-z5
- `site.js`: SETBACK (`B.insetPoly`, layer C-SETBACK, per-side distances), AREASTATEMENT (`B.areaStatement`: per level floor slab → slab over → rooms; coverage and FAR against the largest C-PROP polygon); ramp `kerb` (mesh + rcc / shuttering rows).
- `views2d.js`: schedules Columns, Beams, Walls, Sheets (`SCH_KINDS`). `plot.js`: `opts.raw` + `CAD.plotPdfPages` (multi-page); plot dialog "All sheets" → one PDF.
- `roofs2.js`: dome `shape: "cone"`, `drum` height (230 mm wall; rcc + shut_wall rows).
- `ui-bim.js`: `lift3d` (▲ ▼ 100 mm: assets z / dz, models, ramps, runs, dome / vault off), `copy3d` (⧉).

## 2026.11.21-z4
- `views2d.js`: SHEETADD (frame pline + label on A-SHEET tagged `sheet: "S<n>"`, entry in `d.layouts` with paper / scale / land / title / number); `B.sheets(ed)` returns the layouts whose frame exists, with the frame's present rectangle; SHEET keeps the other sheets and tags its own as S1.
- Plot dialog: one option per sheet (`sheet:<id>`) and `sheet:*` = all sheets, one PDF each.

## 2026.11.21-z3
- CAMPATH: Speed / Height options → `bim.camSpeed`, `bim.camEye`; Tour uses both. Record: MP4 (avc1) tried before WebM. Record + Tour checked in the test browser: stops and saves at the end of the path.

## 2026.11.21-z2
- `site.js`: CAMPATH — one polyline on layer A-CAMPATH (replaced each time). `ui-bim.js` Tour: if that polyline exists the camera walks along it in walk mode (`v.we`, `v.yaw`; eye 1.6 m above the current level, 1.4 m/s or `bim.camSpeed`, look-ahead 1.5 m, time-based turn smoothing); otherwise scenes / orbit as before.
- `roofs2.js`: `smooth()` rewrites vertex normals of the dome / vault shells.

## 2026.11.21-y
- New `js/bim/roofs2.js`: types `dome` (`B.domeInfo`: spherical cap, area 2πRh) and `vault` (`B.vaultInfo`: arc × length); qty as rcc_slab / shut_slab / steel_slab on the curved surface; commands DOME, VAULT; Properties in `ui-assets.js`; movable in 3D. Aliases are only registered when free.

## 2026.11.21-x
- New `js/ui-devices.js` + `server/devices.sql` (not published): `profiles.device_limit` (default 1), tables `user_devices`, `user_device_log`, rpc `device_check(p_dev, p_label, p_take)`, `device_remove`, `admin_device_limits`, `admin_set_device_limit`, `admin_devices`, `admin_device_remove`. Client: device id in localStorage `ep_dev`; check after sign-in (wraps `U.loadNotice`), every 4 min, on focus / online; a blocking dialog when the limit is reached (move here / ask for more / sign out); Users tab: wraps `U.phoneCell` with a devices select and an "in use" list. Does nothing until the SQL has been run (missing rpc → `S.dev.off`). SQL tested on PostgreSQL 16 with stand-in auth tables.
- `desktop/PLAN.md`: plan for the Windows application.

## 2026.11.21-w
- `hatch.js`: 18 more patterns (ANSI33–36, VERT, DASH, SQUARE, ANGLE, TILE, TILE2X1, HBONE, HONEY, TRIANG, STARS, INSUL, GRASS, WATER, PCC).
- Fix: `site.js` aliases BOUNDARY / PLOT / RL removed — aliases win over command names in `Ed.exec`, so BOUNDARY and RL (railing) had been hijacked since -s. New aliases must be checked against `CAD.commands` and `CAD.aliases`.

## 2026.11.21-v
- `templates.json`: category `part` in group `fin` — 25 NS items (partitions, grills, railing, curtains, site fittings); indicative rates.
- `qto.js`: 25 more `B.NSMAP` keys; partitions get `q = {dim:"A"}`, curtains `{dim:"L"}` (pelmet box → key `curtain_pelmet`), car / bike / gas cylinder become view only; `nsQty` accepts kg and cum.

## 2026.11.21-u
- `assets.js` qty: key `sofa` is counted in seats (width, plus the return of an L, / 700 mm); the NS item is per seat (₹11,346 indicative).
- `view3d.js` main shader: sky / horizon / ground reflection by Fresnel on glass (pattern 12) and on gloss > 0.25, Realistic style only.

## 2026.11.21-t
- `view3d.js`: `rayAt`, `moveMode` with `onMoveStart / onMoveDrag / onMoveEnd` (drag on the horizontal plane through the point picked; 25 mm steps). `ui-bim.js`: `MOVABLE` types, live rebuild every 70 ms while dragging, one undo step; `rot3d` (⟲ ⟳ 15°).
- `templates.json`: category `furn` in group `fin` — 33 NS items (supply + carriage + placing labour, DAR add-ons); rates are indicative mid-range 2026. `B.NSMAP` maps 37 library keys to them (unmapped keys 89 → 52).

## 2026.11.21-s
- New `js/bim/site.js`: type `ramp` (`B.EXT.ramp`, `B.rampInfo`; qty as rcc_slab / shut_slab / steel_slab on the sloping length), commands RAMP, PLOTBOUNDARY (`B.parseBearing`, `B.fmtBearing`, `B.plotBoundary`; bearings measured from the sun's north; layers C-PROP, C-PROP-TXT), SPOTLEVEL (layer C-TOPO).
- SHEET asks Landscape / Portrait; `layouts[0].land` is used by the plot dialog.
- Pipes: no separate fittings count — CPWD 18.8 / E&M conduit rates include fittings.

## 2026.11.21-r
- `templates.json`: category `fence` in group `bld` (after `bwall`) — pits / blocks, RCC posts & struts (2 NS items with analysis: post 125×125×2400 ₹1,275, strut 100×100×2400 ₹1,000 — indicative), angle-iron posts, barbed wire (16.17.1, 16.18.1, 16.16, 16.53), chain link / welded mesh, gate.
- `runs.js`: services runs (`grp:"s"`) — CPVC pipes, rain-water pipes, PVC / MS conduit, cable trays; command PIPE; mapped to CPWD 18.8.x / 12.41.x and E&M 1.21.x / 1.20.x / 4.1.x.
- `views2d.js`: `B.refreshViews`, `B.makeSchedule` (blocks `SCH-Doors`, `SCH-Rooms`), commands SCHEDULE, NORTHPOINT (uses the sun's north), SCALEBAR; plot calls `refreshViews` first.
- `ui-bim.js`: material favourites (`ep_matfav`, this device), scenes store sky kind / rotation and night.
- `view3d.js`: 32 point lights.

## 2026.11.21-q
- Elevations: `B.viewLines` returns `tags` — "D w × h" / "W w × h" for doors and windows on walls square to the view whose centre passes the depth buffer; written above the opening. Height: a chain GL → each level → top, with the overall height outside it; a segment too short for upright text gets its text beside the line.

## 2026.11.21-p
- Paint popup: search box (`data-matq`, `matFilter`) hides non-matching materials and empty groups in place; the text is kept in `C.matQ`.
- POP runs (`pop_*`) with no height of their own: `autoZ` puts the underside (false-ceiling height − the band's drop) of the room that contains the run's first point; outside such a room the catalogue height stays.

## 2026.11.21-o
- Runs: `pop_band`, `pop_band_led` (`led: 2` = two LED lines per metre), `pop_band_wide`, `pop_groove`, `pop_wood_rafter` — profiles centred on the drawn line (negative offsets), default underside 2600; key `ceil_step` (rafter: `wall_panel`). `B.runLedLen` multiplies by `D.led`.
- Views: `B.viewBlock` draws the overall width under each view and the overall height at its right as plain lines and text (`dimL`); the title moves down to clear them.

## 2026.11.21-n
- Sections: `B.viewLines` chains each object's cut segments into closed outlines (`fills`); `B.viewBlock` adds them as SOLID hatches on layer A-ELEV-FILL (grey on screen, black in a monochrome plot). Open chains and outlines under 400 mm² are dropped.
- Test sweep (no code change needed): 1,710 cases — every run / cladding / unit kind on straight, L, Z, closed, very short and tiny-size paths, both sides, every LED mode; 576 door combinations (12 designs × 3 heads × 4 leaf kinds × 4 handles); windows and openings with each head; 4 room shapes × 5 ceiling designs × 4 spot options; every sized-furniture item in each design at 3 sizes; all new library pieces plain and stretched. Each was meshed, measured and drawn on plan: no exception, no NaN, no empty mesh.

## 2026.11.21-m
- `templates.json`: 6 new Non-SOR items with analysis (362 in all) — POP / gypsum cornice (m_mfc), stepped / tray ceiling extra per metre of step (m_mfc), cement plaster band, GRC cornice, ready-made decorative piece (m_mtp), kitchen chimney (m_mmk). `r` was computed with `EP.nsCalc` in the app. Market lines are indicative.
- New quantity rows / keys: `run_cornice_ext` (external cornice run), `ceil_step` (length of ceiling step = cove length), `chimney` (kitchen). `B.NSMAP` covers `run_cornice`, `run_cornice_ext`, `run_band`, `plaster_decor`, `ceil_step`, `chimney`.

## 2026.11.21-l
- Quantities → Non-SOR: `B.NSMAP` (key → pattern on a `templates.json` description), `B.loadTpl()`, `B.nsFor`, `B.nsRate`. `B.schedule` gives a row `ns` (template), `unit`, `qty` when no SOR item resolves and the template unit fits the measured dimension (sqm ↔ A, rm ↔ L, nos ↔ N). `B.sendToEstimate` writes such rows as a `b: "x"` item with the template's analysis (`x.ns`), re-using the item on a re-send. The Σ Quantities dialog loads the templates first and shows "Non-SOR item — ready rate analysis" with the analysed rate.
- New keys: `kitchen_wall_unit`, `study_table`, `sink_opening`; `tv_unit` and `study_table` runs are measured by length; the TV back panel row was dropped (the template includes it). `B.MAP.kitchen_counter` → CPWD 2023 8.2.2.2, `sink_opening` → 8.5.

## 2026.11.21-k
- Tutorial: tours `interior` (cladding, mouldings / LED, units, room ceiling, door designs, sized furniture, item materials, light colour, night / sky) and `sheets` (elevation, section, sheet, update, plot / credits). All their selectors were checked against the live ribbon.
- Plan: an arched door / window / opening shows a dashed bow across the opening (`plan` in `bim.js`).
- Units: `kitchen_oven_tall` (row type `ov`) and `kitchen_fridge_bay` (row type `fr`).

## 2026.11.21-j
- RUN / CLADDING / CABINET: `Arc` (end point + a point on the curve → `arcPts`, a point about every 250 mm) after the first point, and `Circle` (centre + radius → closed run) at the start. Curves are polylines, so the mitred sweep makes them look round; on a curved unit each short piece is one shutter.

## 2026.11.21-i
- `B.archSp(o)`: wall left in the top corners of an arched opening = w × rise × (1 − π/4). Used in the wall masonry and plaster deductions and in the door / window area; no lintel is counted over an arched opening.
- Units: at an inside corner the next stretch starts one unit-depth along (no overlap). Kitchen base: `chimney` ("600" | "900") over the hob.

## 2026.11.21-h
- Fix (viewer, `setScene`): an object with any transparent triangle was sent whole to the transparent pass, so its solid faces were drawn in sort order without depth and showed through each other (light triangles on cabinet fronts next to a glass shutter, mirror, hob or sink; the same for any library item that mixes glass and solid parts). Now split triangle by triangle: solid faces go to the opaque pass.
- Sun shadow bias scales with the slope of the face to the sun and with the blur width. Near plane 0.04 × orbit distance (was 0.01), walk 0.12 m (was 0.05).

## 2026.11.21-g
- Night glow: composite shader `uBloom` (28-tap spiral, pixels brighter than 0.8); the post pass now also runs when `night` and there are lights (`bloomOn`), with SSAO off. Fix: the sky shader's `uPic` sampler is always unit 7 — on unit 0 it read the post colour texture while drawing into it (GL_INVALID_OPERATION on the sky triangle).
- `CURVEDWALL` (CW, ARCWALL, ROUNDWALL) in `bim/tools.js`: start, end, a point on the curve → chain of straight walls about 400 mm long (`curve: 1`).
- Kitchen base unit: `sink` / `hob` = left | centre | right, drawn on the counter of the first stretch.

## 2026.11.21-f
- Arched heads: `door / window / opening .head` = "arch" (rise = w / 2) or "seg" (rise = 0.2 w). In `hosted()` (`mesh.js`) the height `h` is to the crown; frame, leaf and panes stop at the springing; the corners are filled with the wall's own face looks through the full thickness; doors / windows get an arched frame band, glass fan and radial bars. Wall quantity still deducts the full w × h rectangle.

## 2026.11.21-e
- `js/bim/assets9.js` (new): size-driven furniture. `pm(id, name, cat, w, d, h, key, vars, build, o)` — `build(w, d, h, e)` returns `{parts, sym}` for the item's own `W`, `D`, `HH`; `def.param = true` (no stretch: `fac` returns null), `def.vars` + entity `var` = design. 14 items (`*_p`).
- Units: entity `open: true` draws the inside of shutter rows instead of the shutters (`unitMesh`).

## 2026.11.21-d
- Arches (`assets8.js`): helpers `vpoly` (convex outline in the item's vertical plane pushed through a depth), `arcBand`, `spandrel`, `withMesh(id, fn)` (adds geometry to an `mk` item). 14 items `pd_arch_*`, `pd_round_window_900`, `pd_niche_arched_600`, `pd_arcade_bay_3m`, `pd_arch_gate_3m`. The infill pieces sit in the wall thickness (230) under the head of a rectangular opening; the wall itself is not cut to an arch.
- Lights: `B.LCOLS`, `B.lightRGB`; asset props `lcol`, `lpow` (0 = off); light entries are `[x, y, z, strength, rgb]`; shader `uPLc[16]`. Runs and room ceilings pass the colour of their LED look.

## 2026.11.21-c
- Fitted units (`fam: "u"` in `B.RUNS`, `unitMesh` in `runs.js`): 13 kinds built from `rows` ([bottom, top, type]: sh, gl, dr, mx, sl, op), shutter count = round(length / mw). Entity extras: `dp`, `handle` (`B.RUN_HANDLES`), `look` = shutters, `look2` = carcass, `lookT` = top, `mirror`, `led`. Qty: front area (`wardrobe`, `tv_unit`, `bookshelf`, `shoe_rack`) or running length (`kitchen_unit`) + `kitchen_counter` area + TV back panel as `wall_panel`. Command CABINET (WARDROBE, KITCHEN, TVUNIT, CUPBOARD, ALMIRAH). At an L corner the two legs simply overlap.

## 2026.11.21-b
- Room false ceiling designs: `room.cdes` (`B.CEIL_DES`: tray, double, island, border), `cbw` border width, `cdrop` step, `cled` LED look, `cspot` (`B.CEIL_SPOTS`). `B.ceilDesign(M, doc, e, zf, H)` in `runs.js` (called from the room case in `mesh.js`), inset by `offsetPath`; `B.ceilInfo` → LED length and spot count, appended to the room's quantities by a `B.qty` wrapper (`led_strip` L, `light_point` N). Concave rooms: the inset is a plain mitred offset, so very narrow necks can overlap.
- Doors: leaf styles groove, vgroove, panel6, carved, vision, halfglass, louvre, jali added to `leafShape` (`mesh.js`); `door.handle` ("" lever steel, black, gold, pull, none).

## 2026.11.21-a
- Cladding runs: `holesOn(doc, e, a, b)` (`B.runHoles`) finds doors / windows / openings of walls parallel to and within th/2 + 120 mm of a segment; `strip()` splits round them; qty deducts the area. Entity `cut: false` covers them instead.
- Library items: own size `W`, `D`, `HH` (mm) → `B.assetFac` stretch factors, applied to the mesh vertices, normals and edges after `def.mesh` (anchored at the top for ceiling items), to the plan symbol and to measured quantities. It is a stretch: handles, legs and shutters stretch with it.

## 2026.11.21-z
- `js/bim/runs.js` (new): BIM type `run` (`B.TYPES.run`, `B.EXT.run`: plan, xform, qty, mesh), catalogue `B.RUNS` — profile family (`fam: "p"`, stepped profile `pr` swept with mitred corners by `offsetPath`) and cladding family (`fam: "c"`, generators `batten` and `grid`). Entity: `{kind, pts, closed, side, z, h, mw, rh, led, ledLook, look, noq}`. LED modes `B.RUN_LED`; LED length `B.runLedLen`; point lights pushed to `H.lights`. Qty: profile = L (keys `run_cornice`, `run_band`, `skirting`, `false_ceiling`), cladding = A (`wall_panel`, `acp_panel`, `stone_veneer`), LED = L (`led_strip`). `run_cornice`, `run_band`, `led_strip` have no SOR mapping yet. Commands RUN (MOULDING, CORNICE, LEDLINE, SKIRTING) and CLADDING (CLAD, WPC, ACP, LOUVRE) with Type / Flip / Undo / Close. Properties in `ui-assets.js`.
- Shader pattern 16 (`PT.emit`): surface never darker than 1.2 × its colour; all `led_*` looks and `lamp` use it.
- Cladding runs do not cut round doors / windows and do not follow a wall when the wall moves.

## 2026.11.20-y
- `js/bim/assets8.js` (new): 164 more looks (paint shade card `paint_*`, exterior, enamel, putty, primer, distemper, lime wash, stucco, `plaster_pop_white`, `plaster_grc`, tiles, granite, marble, sandstone, cladding, wood, laminate, metals, glass, LED colours, ACP finishes) — added only when the id is free (`add`). New categories "Plaster & façade decoration" (37, key `plaster_decor`, `mould()` stepped profiles) and "ACP & façade" (11, key `acp_panel`); 30 lights (`lt_*`), 7 POP ceilings (`fc_*`), 11 taps (`tap_*`, key `tap_fitting`). `B.FIN_LOOKS_MORE` → `wallfin.js` appends materials to the wall-finish kinds.
- Material swap per library item: entity property `mat:<look id>` = replacement look, applied in `B.EXT.asset.mesh` (`LK`); Properties lists the item's looks from a dry run (`B.assetLooks`). LED looks are not swappable. Keys `plaster_decor` and `tap_fitting` have no SOR mapping yet.
- `MAT_CATS`: paints group takes `plaster_*`; wood group takes `laminate_*`.

## 2026.11.20-x
- Sky: `KFS` now shoots world-space view rays (camera basis uniforms `uCR uCU uCF`, set in `_skyU`), so the horizon follows the camera. `P.SKIES` presets (clear, clouds, overcast, dusk, studio, pic), `setSky({kind, rot, src, hz, pano})`; clouds are procedural fbm (drift while ▶ Play); `light()` changes sun / ambient for overcast, dusk and studio. Own picture: `_skyTex` on unit 7, 2:1 pictures are a full panorama, others are mirrored round (`uPicA`). Stored in `bim.sky`; UI in the ☀ Sun popup (`applySky`, `data-v3sky*`). Not image-based lighting; not saved per scene.
- `js/bim/views2d.js` (new): `B.viewLines(doc, {dir, cut})` — hidden-line view from `B.meshes` with a software depth buffer (about 1700 px on the long side), group edges + silhouette edges (front/back face pairs), section = clip at the plane and thick cut lines. `B.viewBlock` adds ground line, level marks, title. Commands ELEVATION (EL), SECTION (SEC, stored in `bim.sections`, mark ents carry `sec: id` on layer A-SECT-MARK), VIEWSUPDATE (VU), SHEET (LAYOUT): views are blocks `EL-<side>` / `SEC-<id>`; SHEET flows them under / beside the plan, picks the smallest standard scale that fits the paper, writes `d.layouts[0] = {paper, scale, land, rect}`. Plot dialog has "Sheet layout". Decoration and cut-out assets are left out of views. No poché fill, no automatic dimensions.
- Credits: `js/ui-credits.js` (File ▾ → Credits for models and pictures; `bim.credits`, `B.creditItems`, `B.creditsText`, `B.creditGaps`; remembered in localStorage `ep_credits`), static `credits.html` linked from the footers.

## 2026.11.20-w
- Own material pictures: `bim.texs` (max 5), `B.addTex`, `B.regTex` → looks `tex_<id>` with pattern 20 + slot and `B.TEXSLOTS`; shader samplers `uTx0…4` on texture units 2…6 (`_matTex`, REPEAT, mipmaps); world-space mapping scaled by the picture's real width. Not in PDF / DXF output; plan fill uses the picture's average colour.

## 2026.11.20-v
- `B.parseGLTF`: base colour textures are baked into vertex colours after the images decode (`res.baking` promise, `res.baked`, `B.onGlbBaked` → redraw). Per-vertex sampling: colour areas and palette textures are right, grain inside a triangle is lost. Not read: KHR_texture_transform, normal / roughness maps, Draco.

## 2026.11.20-u
- `ui-assets.js`: `placeGlb(ed, C, buf, file)` (shared by file import and the library); "My 3D models on this device" in IndexedDB `ep_models` (`mdlAddFiles`, `myModelsHtml`), kinds in `MCATS`, up to 20 files of 25 MB at a time. GLB limits unchanged: textures show as plain colours, Draco-compressed files are not read.

## 2026.11.20-t
- Light fittings light the scene: `H.lights` → `sc.lights` ([x, y, z, strength] in m) collected in `B.EXT.asset.mesh` for items in category Lighting or named light / lamp / chandelier; the 16 nearest go to `uPL[]` each frame (no shadows from them, so light passes through walls). `night` flag: night sky palette, sun off, stronger fittings.

## 2026.11.20-s
- `hipConvex(e)` in `js/bim/bim.js`: hip roof on convex outlines with slanting sides (exact: faces tile the outline, rise = distance to the nearest side). Used by `B.hipOrtho` when the orthogonal builder returns null. Still not handled: slanting outlines with inside corners, and gable roofs on slanting outlines.

## Waiting for the owner
- Supabase project of the app to be connected: admin switches (module on / off), WhatsApp picture messages, shared cut-out library for all users.
- The 30 quick rates that differ from their analysis (tipper, tanker…): owner will say.

## 2026.11.20-r
- Moving vehicles: `B.meshes` marks a non-cut-out asset with `walk > 0` as `mv: { d, dir }`; `setScene` keeps such groups out of the merged buffer (`this.movers`, own VAOs) and `_drawMovers()` draws them in the main and shadow passes with `uOff`. Not pickable / measurable while separate; no edge lines.
- `ui-assets.js`: own pictures also stored in IndexedDB `ep_pics` ("My pictures on this device"), multi-file add.
- Pictures from the web are not bundled: free cut-out libraries allow use in one's own renders, not redistribution inside an app, and those sites cannot be reached from the build workspace.

## 2026.11.20-q
- Cut-outs are drawn into the shadow map turned towards the sun (`_drawCuts(lvp, null, sunDir)`), so they cast their outline.
- `play` flag: cut-outs with `walk` (m) move back and forth along the item's rotation at 1.2 m/s; asset properties `walk`, `flip`.
- `xray` flag (`uXr`), section box `box = [x0, x1, y0, y1]` (`uBox`); the ground is not cut. Known: objects cut away by the section box still cast shadows; edges are hidden while the box is on.
- Not done: moving vehicles (meshes are one static buffer).

## 2026.11.20-p
- Shader: tile pattern (`pi==6`) is a straight grid with `fwidth` anti-aliased joints and per-tile tone; no brick bond.
- `EP.qtyIn(text, unit)`; the NS analysis quantity box converts a typed unit (kg, bags, sqft, cft…) to the line's unit on change.
- Check run: every estimate sub-section and every app screen renders without an exception in the test harness (items, suggested, header, abstract, analysis check, versions, history, export; users, design, help, library, basic, sors, backup, reviews, photos, scan, cad, samples, tutorials).

## 2026.11.20-o
- Viewer: picture cut-outs — `sc.cutouts` ({p, h, w, src, flip}) from `H.cutouts` in `B.meshes`; `_cutTex()` loads a picture into a texture (unit 7), `_drawCuts()` draws alpha-tested upright cards turned to the camera (pass 7b). No shadows cast, not pickable in 3D.
- `js/bim/assets7.js` (new): built-in vector figures and trees (`figure()`, `treePic()`), `B.addPic()` / `B.regPics()` for the user's own PNGs kept in `bim.pics` (shrunk to 768 px).
- Not done: moving people / vehicles; photographs are not shipped with the app (licensing) — the owner adds his own PNGs.

## 2026.11.20-n
- `WALLFINISH` (`WF`, `DADO`): puts a `wall.fin` record on a clicked face, or on every wall along a room outline (`Room`), with kind / height / from / material options.
- `js/bim/assets6.js` (new): boundary wall bays, grand gates, fountains.
- `js/bim/assets5.js`: extra part types `x` (side profile extrusion), `w` (wheel), `g` (irregular ellipsoid), `k` (tube between two points), `q` (two-sided blade) through `xmesh()`; people, vehicles, trees and road pieces rebuilt with them. Still stylised geometry — photo-real people and cars need imported GLB models.
- Decoration counted on request: `e.noq === false` → row keyed by the item id.
- 3D: `v3mode("tour")` interpolates saved scene views; `v3mode("rec")` records the canvas with MediaRecorder (WebM).
- Not done: moving people / vehicles in the view (the scene is one static buffer).

## 2026.11.20-m
- `js/bim/assets5.js` (new): category "Decoration (view only)", 45 items, `def.deco = true`. `B.EXT.asset.qty` returns no rows for `def.deco` or `e.noq === true` (property "Count in the estimate").
- Viewer: `uHead` uniform — a light at the eye position while walking; ambient 0.70 in walk mode.
- Pending (owner's decision): the 30 quick rates that differ from their analysis (tipper, tanker…). Pending (needs the app's Supabase project): admin switches, WhatsApp picture messages.

## 2026.11.20-l
- 3D viewer: `setWalk(on, floorZ, pos)`, `walkMove(f, r, u)`, `walkDir()`; first-person matrices in `mats()`; keys W A S D Q E + arrows on the canvas; `spin` flag (turntable); `hitPoint(x, y)` ray-casts the kept vertex data (`opRaw`, `trRaw`) and snaps to triangle corners; `project(p)`; `onFrame`, `onMeasure` hooks.
- UI: `v3mode()` in `js/ui-bim.js` — Walk, Measure (SVG overlay `.v3-ov`), move pad `.v3-pad`, message strip `.v3-msg`.
- Not possible from this repo: admin on / off switches and WhatsApp picture messages need server tables / functions in the app's Supabase project.

## 2026.11.20-k
- CAD ribbon: `CAD.RSEC` (sections per tab) and `CAD.RLABEL` in `js/ui-cad.js`; `ribbonTab()` renders `.cad-sub` groups. Commands not on the ribbon before now have buttons and icons.
- `EP.ev`: length units on numbers (mm, cm, m, ft / ', in / ", feet-inches) → metres; `pi`, `sqrt()`, `^`. Used by every measurement and analysis field, print and Excel export.
- Measurement sheet: `SHAPES` rows (`data-mshape`), row copy (`data-mdup`), quick conversion chips (`data-qcvp`), headers without "(m)" when a conversion is on.
- Units: brass, 100 sqft, decimal / cent, guntha, dozen, gaj.
- Tutorials: selectors were stale (`data-cmd`); rewritten against real controls, `tab` opens a ribbon tab; 7 tours.
- Update pictures: `window.EP_PICS` + `/updates/*.jpg`; the owner's WhatsApp banner shows them and adds their links to the text. Real media messages need a change in the `wa-outbox` server function (not in this repo).

## 2026.11.20-j
- Library items can be measured instead of counted: `def.q = { dim: "A" | "L" | "M", kg, h }` (set in `assets4.js` by key). `M` = elevation area × typical kg/m² — approximate, said so in the formula.
- `B.MAP` entries for grills, gates, railings, shutters, stone jali and eight older fire / toilet / sign items. Temple items and items with no schedule item are `null` on purpose (use the Non-SOR items).

## 2026.11.20-i
- Design Studio `to_svg`: pattern fills (`dsf-concrete`, `dsf-soil`, `dsf-brick`, `dsf-water`) for polygons; PDF / DXF unchanged (flat fills).
- Design Studio calculations spot-checked by hand (RCC beam, slab, column, footing, retaining wall, steel beam): no errors found. Not a full audit of all 37 modules.
- `templates.json`: 23 more Non-SOR items (kitchen platform and stone linings, new category `m_mpr` parapet / coping / railings, designer and roof tiles, texture finishes).
- Check run: all 356 Non-SOR analyses compute with no empty line. 30 stored quick rates `r` differ > 3 % from their analysis (mostly machine-hire items, where the result follows the diesel / hire settings) — left as they are.

## 2026.11.20-h
- `js/bim/railing.js` (new): `B.RAIL_STYLES` — the `railing` element takes `style` (11 railing + 10 parapet designs), `th` (parapet thickness), `ph` (low wall height). `B.railMesh`, `B.railPlan`, `B.railQty`. Command `PARAPET` (`PRP`); `RAILING` has a `Design` option. Parapet masonry for designs with openings uses an approximate solid share (shown in the Σ formula).
- `js/bim/assets4.js` (new): 23 temple / ornamental items, 22 grills, gates and railing panels; mount `top` = on the slab above the level.
- 49 new looks (tiles, stones, paints, textures, sandstone, PVD steel, cast iron, glass).
- `templates.json`: Non-SOR vanity counters (fascia, side supports, cabinet, complete sets), grills / gates / railings by material, temple work. Market lines are indicative — replace with quotations.
- Not done yet: Design Studio review, SOR mapping for library items.

## 2026.11.20-g
- Gable roofs on L / T / U outlines: ridges run to the wing ends, gable walls are filled (`B.hipOrtho` handles `kind: "gable"` too).
- `DIMWALLS` (Building tab → Auto dimension): overall sides, openings chain on exterior walls, clear room sizes.

## 2026.11.20-f
- Library items: height reference `ref` (`floor` / `fceil` / `ceiling` / `top`) + distance `dz`; rooms have a false-ceiling height `fch`, drawn in 3D.
- Column sections: `octagon`, `hexagon`, `L`, `T`, `plus` (`tw` = leg thickness). `B.colPoly`, `B.colSection`.
- `js/bim/assets3.js`: 60 materials, 100+ items, 7 wall finishes by area (merged through `B.FIN_MORE`).

## 2026.11.20-e
- `FLOORCOPY` (Copy floor). ORTHO applies while dragging a grip.

## 2026.11.20-d
- Hip roofs on L / T / U outlines (`B.hipOrtho`): the outline is cut along every possible hip / valley / ridge line, each piece lies on one roof plane.
- `COLUMN > Corners`, `RAILING > Around`, width grips on doors / windows.

## 2026.11.20-c
- Library items snap flush to walls (`B.assetWallSnap`), `Turn`, drag and drop from the Library panel.
- `Doc.bbox` / `Doc.segs` point the BIM context at their own document (building elements were missing from pick / zoom after opening a drawing).

## 2026.11.20-b
- `ROOF` / `SLAB > Walls` (`B.wallOutlines`), 3D Paint popup, material library clicks fixed, `RF` = roof (`RB` = rebar).

## 2026.11.20-a
- Grips on every element, joined corners move together (Alt = one only, `GRIPLINK`), add / remove nodes, live preview.
- 3D viewer fixes: previews, Parallel, picking, ground level, Left / Right, view cube, shadows, render image.
- Roofs follow a rotated building; Enter at a "select object" prompt cancels.

## Known gaps
- Hip / gable on outlines with slanted sides fall back to the bounding-rectangle roof.
- L / T / + columns have no automatic bar layout.
- Most new library items have no SOR item mapped yet (chosen in Σ Quantities).
- DXF export writes ellipses, splines and dimensions as plain lines / polylines.
- Rate data to review: analysed rate is negative for CPWD 9.12, 9.13 (2021 and 2023) and 9.55.1 (2023), and zero for 15.60 (2023).
