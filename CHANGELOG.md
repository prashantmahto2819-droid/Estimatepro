# Estimate Pro — change log (CAD Studio / 3D)

This file is for the people maintaining the app. It is not published with the site (see `.assetsignore`).
The text users see is `EP_NOTES` in `js/version.js`.

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
