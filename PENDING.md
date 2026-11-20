# Estimate Pro — pending work (kept with the code; not published)

Last updated at version 2026.11.20-v.

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
   A credits list (author + licence for every CC-BY file) must be kept; the app needs a Credits page before such files are shipped to users.
3. Decisions: the 30 quick rates that differ from their analysis (tipper, tanker…); whether 1:30 / 1:40 / 1:60 scales may be used on Design Studio sheets.
4. Commercial plans (owner will describe).

## B. 3D Studio — to build (no server needed)
1. (done in -u for one device: My 3D models.) (-v: texture colours baked per vertex.) Still open: true per-pixel textures, Draco files, a shared library for all users (needs the server), thumbnails, plan symbol from the model outline.
2. (done in -t: fittings light the scene, Night view.) Still open: lights do not cast shadows and pass through walls; emissive glow on the fitting itself.
3. Picture textures on surfaces (own tile / marble / wallpaper photo on a wall or floor).
4. Sky and background picture; ground materials by area.
5. Reflections on glass and water; softer shadows.
6. Vehicles that turn at the end of the path, wheels that turn; people with a walking cycle.
7. Camera path drawn on the plan for the video; MP4 export where the browser allows.
8. Section box: hide the shadows of cut-away parts; section fill colour.
9. Select / move / rotate objects directly in 3D.
10. Slanting outlines with inside corners (hip), gable roofs on slanting outlines, curved roofs, domes as roof elements.

## C. CAD Studio — to build
1. Layouts / sheets with title block and several scaled views; print sets.
2. Real dimensions, ellipse and spline in DXF export; DWG is not possible in the browser.
3. Curved walls, sloping slabs / ramps, split levels.
4. Section and elevation drawings generated from the model.
5. Door / window schedule and room finish schedule as tables on the sheet.
6. Hatch patterns library, text styles, blocks library shared between drawings.
7. Plumbing and electrical runs (pipes, conduits) with lengths in Σ Quantities.
8. Site: contours / levels grid, plot boundary from bearings, north point and scale bar.

## D. Other
1. Design Studio sheets: views are small and some labels overlap.
2. SOR mapping for the remaining library items.
3. Deeper testing of screens that need a signed-in server session.
