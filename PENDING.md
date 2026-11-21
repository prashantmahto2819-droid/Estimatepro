# Estimate Pro — pending work (kept with the code; not published)

Last updated at version 2026.11.21-p.

## A. Waiting for the owner
1. Connect the app's Supabase project (ref starts `eaygozhjsmohfcuiazfm`) to the build session. Then: admin dashboard switches (module on / off), WhatsApp update messages with real pictures, shared cut-out / model library for all users.
2. Files to supply (use only files with a licence that allows commercial use):
   - GLB models, a few of each kind, small files (ideally under 2–5 MB, not Draco-compressed). The owner can add them himself with Library → "＋ Add 3D models to my library (GLB)" (kept on that device); to ship them to every user they must come to the build session or the shared server library:
     - Vehicles: hatchback, sedan, SUV, pickup, bus, scooter, auto.
     - Sanitary & bath: WC (floor and wall-hung), basins, vanity, urinal, shower, bathtub, taps, accessories.
     - Furniture: sofa sets, beds, dining, wardrobes, office tables and chairs, TV unit.
     - Kitchen: modular units, hob, chimney, sink, fridge.
     - Lighting & fans, false-ceiling pieces, partitions, doors.
   - People and tree cut-outs as PNG with transparent background (10–20).
   - Optional: furniture / sanitary GLB models, sky pictures (JPG) for the background.
   Where to download (check the licence shown on each model before using it; keep a note of the author for CC-BY models):
   - Poly Haven — https://polyhaven.com/models — CC0, realistic furniture and props, glTF download.
   - Kenney — https://kenney.nl/assets — CC0 packs (furniture kit, car kit, city kit), GLB included, simple low-poly look.
   - Quaternius — https://quaternius.com — CC0 packs (cars, furniture, nature), glTF.
   - Poly Pizza — https://poly.pizza — small GLB models; mostly CC-BY (credit needed), some CC0.
   - Sketchfab — https://sketchfab.com/search?features=downloadable&type=models — biggest choice (sanitary ware, sofas, cars); set the licence filter to CC0 or CC BY; avoid NC (non-commercial) ones; download as glTF / GLB.
   - People / tree PNG cut-outs — https://www.gendo.ai/people-png , Viz-People free packs.
   A credits list (author + licence for every CC-BY file) must be kept. (-x: `credits.html` exists and each drawing has File ▾ → Credits for models and pictures. Files shipped with the app must be added to the table in `credits.html`.)
   Material pictures (tiles, marble, wood, wallpaper, fabric) for "＋ Add your own material picture" and for a built-in picture library:
   - ambientCG — https://ambientcg.com/list?type=material — CC0, seamless (tiles, marble, wood, plaster, fabric). Download the 1K JPG, use the "Color" picture.
   - Poly Haven textures — https://polyhaven.com/textures — CC0, seamless.
   - Share Textures — https://www.sharetextures.com/textures — CC0.
   - Company tile / laminate / ACP shade cards: use only with the company's or dealer's permission; a straight photo of the real sample taken by the owner is always fine.
   What to send in the chat, in this order (10–20 files at a time, name each file by what it is, e.g. `wc-wall-hung.glb`, `tile-600x600-beige.jpg`):
   1) sanitary ware and taps (GLB), 2) furniture — beds, sofas, wardrobes, TV units, doors (GLB), 3) decorative and garden lights (GLB), 4) cars, people, trees (GLB or PNG), 5) material pictures (JPG) with the real width of the area shown, 6) sky / site background (JPG). With each batch say the site it came from and the licence shown there.
3. Decisions: the 30 quick rates that differ from their analysis (tipper, tanker…); whether 1:30 / 1:40 / 1:60 scales may be used on Design Studio sheets.
4. Commercial plans (owner will describe).

## B. 3D Studio — to build (no server needed)
1. (done in -u for one device: My 3D models.) (-v: texture colours baked per vertex.) Still open: true per-pixel textures, Draco files, a shared library for all users (needs the server), thumbnails, plan symbol from the model outline.
2. (done in -t: fittings light the scene, Night view.) Still open: lights do not cast shadows and pass through walls; emissive glow on the fitting itself.
3. (done in -w: up to 5 own material pictures per drawing.) Still open: rotate / offset the picture on a surface, more than 5, a device library of materials.
4. (done in -x: sky presets and an own background picture.) Still open: the picture does not light the model (no image-based lighting), sky is not saved per scene, ground materials by area.
5. Reflections on glass and water; softer shadows.
6. Vehicles that turn at the end of the path, wheels that turn; people with a walking cycle.
7. Camera path drawn on the plan for the video; MP4 export where the browser allows.
8. Section box: hide the shadows of cut-away parts; section fill colour.
9. Select / move / rotate objects directly in 3D.
10. Slanting outlines with inside corners (hip), gable roofs on slanting outlines, curved roofs, domes as roof elements.

11. Materials: (done in -y: 386 looks — paint shade card, putty / primer / distemper, enamel, textures, tiles, granite, marble, wood, laminate, metal, glass, ACP; any material of a library item can be swapped in Properties.) Still open: picture-based (photo) materials built in for all users (needs the files above), bump / roughness maps, (-p: search box in Paint) material favourites, search by colour, brand shade codes.
12. Plaster and façade decoration: (done in -y: 37 pieces — cornices, bands, surrounds, quoins, columns, balusters, jali, kangura.) (-z: RUN draws cornices, bands, skirting, LED lines from point to point with mitred corners.) (-d: 14 arch and round pieces — surrounds, infills that make an opening round-headed, fan-light, round window, niche, arcade bay, entrance arch.) (-f: doors, windows and openings take a round or flat-arched head, with a fan-light.) (-i: arch area deducted exactly; no lintel under an arch.) (-k: dashed bow on plan.) Still open: arched head / in the door schedule, pointed and horseshoe arches, (-g: CURVEDWALL makes a round wall from short straight walls) a true smooth curved wall, (-j: mouldings, LED lines, cladding and units follow an arc or a full circle) runs that follow a wall face by one click, profile at the free ends (returns), grooves cut into the plaster of a wall face, custom profile drawn by the user.
13. ACP / POP: (done in -y: ACP sheet finishes for WALLFINISH, 11 ACP pieces, 7 POP ceiling designs with lights.) (-z: CLADDING draws WPC louvres / planks, ACP panels / planks, HPL, stone strips, fins and glass panels from point to point, with LED in joints / top / bottom.) (-a: cladding is cut round the doors and windows of the wall behind, area deducted.) Still open: cladding on ceilings and on sloping lines, panel layout starting from a chosen corner, (-b: a room's false ceiling takes a design — tray, double step, island, border — with LED and spot lights, counted in Σ Quantities.) (-o: free-shape POP bands, panels, grooves and rafters drawn by points / arc / circle with RUN.) (-p: a POP band drawn inside a room with a false ceiling hangs under it by itself.) different heights in parts of one room.
14. Lights: (done in -y: 30 more decorative / garden lights.) (-z: LED and lamp surfaces glow; LED colour per run.) (-d: light colour and brightness per fitting; LED runs and ceilings throw their own colour.) (-g: glow round lamps and LED lines at night.) Still open: shadows from fittings, light cones on walls, more than 16 lights lit at once. (The light triangles seen on cabinet fronts in -c … -g were not shadows: fixed in -h, see CHANGELOG.)
15. Furniture / doors / fittings: (-a: any library item takes its own width, depth and height — a plain stretch.) (-c: CABINET draws wardrobes, loft, kitchen base / wall / tall units, TV unit, crockery, bookshelf, study table, vanity and shoe cabinet from point to point; shutters, drawers and handles follow the length.) (-e: units can show their inside — shelves, rail, drawers; 14 size-driven furniture items — beds, sofas, dining sets, tables, desks, reception, bench, shelves, mirror, curtain, rug.) (-g: sink and hob on the kitchen counter.) (-i: clean inside corners, chimney over the hob.) (-k: fridge bay and tall oven / microwave unit as unit kinds.) Still open: dishwasher / washing-machine bays, corner carousel shown inside, chairs and stools of chosen design round a table, recliner / sofa-cum-bed; (-b: 12 door designs and 5 handle types on the door element.) Still open: door frame designs, arched heads, double-door designs with a fixed leaf, window grill patterns.

16. Estimate link for the new elements: (done in -l: rows with no SOR item take a Non-SOR item with its ready rate analysis — wardrobes, kitchen base / wall units, TV unit, study table, LED profile, taps; kitchen counter → CPWD 8.2.2.2, sink opening → CPWD 8.5.) (-m: six new Non-SOR templates with analysis — POP cornice ₹222/rm, stepped-ceiling extra ₹560/rm, plaster band ₹292/rm, GRC cornice ₹2,097/rm, decorative piece ₹1,773 each, kitchen chimney ₹22,000 each — and their rows in Σ Quantities. OWNER: these six rates are my indicative market figures; check them against local quotations and tell me what to change.) Still without an item: loose furniture (beds, sofas, dining), curtains, mirrors, whole decorative columns and arches (now priced as one 'decorative piece' each, which is too low for large pieces).

## C. CAD Studio — to build
1. (done in -x: SHEET puts plan + elevations + sections in one frame at one scale and plots with the title block.) Still open: several sheets per drawing, views at different scales on one sheet, print sets, sheet in portrait.
2. Real dimensions, ellipse and spline in DXF export; DWG is not possible in the browser.
3. Curved walls, sloping slabs / ramps, split levels.
4. (done in -x: ELEVATION, SECTION, VIEWSUPDATE.) (-n: cut parts are filled.) Still open: (-o: overall width and height on every view) opening and level-to-level dimensions and material notes on elevations, door / window swing marks, outlines for library items that have no edges, views update on their own.
5. Door / window schedule and room finish schedule as tables on the sheet.
6. Hatch patterns library, text styles, blocks library shared between drawings.
7. Plumbing and electrical runs (pipes, conduits) with lengths in Σ Quantities.
8. Site: contours / levels grid, plot boundary from bearings, north point and scale bar.

## D. Other
1. Design Studio sheets: views are small and some labels overlap.
2. SOR mapping for the remaining library items.
3. Deeper testing of screens that need a signed-in server session.
