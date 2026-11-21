# Estimate Pro — change log (CAD Studio / 3D)

This file is for the people maintaining the app. It is not published with the site (see `.assetsignore`).
The text users see is `EP_NOTES` in `js/version.js`.

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
