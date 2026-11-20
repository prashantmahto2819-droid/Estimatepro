# Estimate Pro — change log (CAD Studio / 3D)

This file is for the people maintaining the app. It is not published with the site (see `.assetsignore`).
The text users see is `EP_NOTES` in `js/version.js`.

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
