# Estimate Pro — change log (CAD Studio / 3D)

This file is for the people maintaining the app. It is not published with the site (see `.assetsignore`).
The text users see is `EP_NOTES` in `js/version.js`.

## 2026.11.21-z129
- 3D toolbar: '🌍 Ground' toggle (v3.showGround). Design Studio drawings set the natural ground level to the model's ground (bs.ngl = 0) and no longer hide the ground automatically, so footings are below the surface.

## 2026.11.21-z128
- Shared floor inputs / quantities (DS.core.floorParams, floorQty) used by steel_shed, steel_portal and steel_truss: filling (2.25 / 2.25(a) / 2.27), PCC 1:2:4 floor, finish, PCC apron.
- No double counting with the 'Along with the design' extras: when x_floor is chosen its floor replaces the PCC floor / finish here (filling still applies), and x_plinth replaces the apron. 3D (steel_shed, steel_portal) shows the floor, filling and apron for either.

## 2026.11.21-z127
- Design Studio: 'My designs' bar under the inputs — Save as… (name), open from a list (all modules), Save (overwrite the open one), Delete. Kept on this device (localStorage ep_ds_saved) with module, mode, inputs and site / basis.

## 2026.11.21-z126
- Design Studio: modules can carry presets (spec.presets: name, help, mode, set) shown as buttons beside Reset inputs. Complete steel shed: Light PEB, Light small shed (ISMC + angles, free design), Standard.

## 2026.11.21-z125
- Complete steel shed truss (check / free design): top chord, bottom chord and knee brace accept '1-ISA …' (single angle) and ISMC besides two angles b/b and rolled I; web members accept ISMC 75–150. Member check, analysis stiffness, BOM and 3D follow.

## 2026.11.21-z124
- Design Studio → Quantities: items and merged rows sent to an estimate are tagged with the module (ds). When the estimate already holds this design, a button 'Update the estimate' removes those and adds the present quantities into the same part (older untagged sends: the design's own 'Design – …' part is replaced).

## 2026.11.21-z123
- Steel shed 3D: floor top at plinth level (pedestal top, min 100 mm), filling drawn below it down to the ground (was a thin layer below ground, hidden). Racks / benches stand on the floor. Default filling 200 mm.

## 2026.11.21-z122
- Complete steel shed: group 'Inside: racks & seating' — storage racks (n, L, D, H, shelves, side) and seating benches (n, L, seat MS sheet / BWP ply, side). Quantities: MS angle frames + sheet in kg (CPWD 10.25.2), ply seat Non-SOR, painting 13.61.1. 3D places them in a row along the chosen side.

## 2026.11.21-z121
- Complete steel shed: group 'Floor & sides' — fill type (CPWD 2.25 / 2.25(a) / 2.27) and thickness, PCC 1:2:4 floor, finish (13.18 punning / 11.3.1 CC 40 mm), 230 brick dado below the sheeting on clad sides (brick 6.4.2 + plaster 13.4.2 both faces + DPC 4.10; sheeting area reduced), PCC 1:4:8 apron (4.1.8). 3D shows fill, floor, dado (sheeting starts above it) and apron.

## 2026.11.21-z120
- Send to CAD Studio (3D model / drawings): if a drawing of the same name exists, a dialog offers 'Update it' (replaces the dsmodel and the sheets that came from Design Studio, marked e.ds; hand-drawn objects stay) or 'New copy'.
- Complete steel shed 3D: PCC floor slab when 'Floor inside: PCC' > 0.

## 2026.11.21-z119
- Complete steel shed and portal shed: 'sheet only these bays' text for each long side (1 = front bay; 1,3 / 1-2; blank = all) — cladding area, girts, sag rods, Cpi (partly open → dominant opening) and 3D follow. Core: DS.core.bayList().
- Complete steel shed: gable wind posts (and F2 footings) only when the span exceeds the max. gable post spacing and a gable is clad (a 3 m shed had two extra posts).
- CAD Studio list: thumbnails kept on the device (made on closing a drawing, and drawn quietly for older drawings), and a delete button on each card (click twice). PNG exports and thumbnails leave out the grid, axes and compass.

## 2026.11.21-z118
- Complete steel shed: the 'Open sides' select is replaced by four ticks (left / right long side, front / back gable end); girts, cladding area, Cpi (dominant opening) and 3D follow each side. 3D now opens the same long side as the design (previously the select opened opposite sides in design and 3D).

## 2026.11.21-z117
- Sections: new double channel (2-ISMC xxx box / b/b) with parallel-axis Iy, closed-box It, two webs in shear, overall width for base plate; classification uses one channel's outstand (bo).
- Portal shed (steel_portal) check / free design: column & rafter lists now ISMB + ISHB + ISMC + 2-ISMC box/b/b + BU; new 'Secondary members' group (girt, eave strut, bracing angle or rod) used in quantities and 3D.
- Complete steel shed (steel_shed): ISMC and 2-ISMC in column / rafter lists; bay spacing from 1.5 m; optional PCC 1:2:4 floor (with 150 mm filling) in quantities.
- 3D: channel and double-channel columns / rafters drawn as channels.

## 2026.11.21-z116
- Industrial shed – portal frame (PEB): new group "Cladding & open sides" (walls clad + left long side, right long side, front gable, back gable open). Open sides drop their sheeting and girts in the quantities and 3D; any open side → Cpi ±0.7 (IS 875-3 cl 7.3.2.2).
- Complete steel shed: front / back gable end open options (sheeting area, Cpi, 3D).
- 3D: c.openSides {L,R,F,B}; old models with c.open still work.

## 2026.11.21-z115
- BIM quantity take-off SOR mapping fixes (found while preparing the Barpali estimate): rolling shutters (door kind shutter) → new key door_rolling, CPWD 10.6.1, and no door frame for them; steel doors → 10.5.1 (text search used to pick 9.52, a deduct item); Kota floors → 11.26.1 (was a wall-lining item); skirting → 11.41.2 (was marble veneer 8.11.1); exhaust fans → EM 1.50.1 installation (was louvre extra 1.51).

## 2026.11.21-z114
- Consent dialog cut to the minimum: title, one required tick (Privacy Policy & Terms, with links), one optional tick (WhatsApp updates), Cancel / Agree (Agree stays off until the required tick).

## 2026.11.21-z113
- Consent before an account is created (js/ui-consent.js): email sign-up, OTP on WhatsApp / email, Google sign-in and OTP server functions are held until both required boxes (Privacy Policy + Terms; processing and OTP / account messages on WhatsApp / email) are ticked; cancelling sends nothing, so no account is made.
- WhatsApp update notifications: separate optional box, off by default; the choice sets profiles.wa_optout.
- Accounts without consent for this version (older ones, admin-made ones) are asked once after sign-in; declining signs out.
- Consent kept in user_metadata (consent_ver, consent_at, wa_optin) and, after server/consent.sql is run, in consent_log + profiles.
- Privacy Policy: new section 3 (consent and WhatsApp messages), mobile number and consent record in the data table, WhatsApp (Meta) / Vivid Relay as a provider. Terms: consent first.

## 2026.11.21-z112
Gumti (portable shelter for mines) — SOR first now follows the way it is actually built:
• Roof: MS sheet 2 mm welded on the frame with EPS thermocol 50 mm under it — no GI sheet, no false ceiling. Cool-roof (high-albedo) paint stays.
• Door and windows: MS sheet door (DSR 10.5.1); MS sheet window shutters in angle frames as DSR steel work, with MS grill (DSR 9.48.1). Sunshades in MS sheet as steel work.
• Plywood: good BWP / marine plywood for the wall lining, floor and bench (kept as Non-SOR — the DSR particle-board items do not last in a gumti).
• Electrical work (wiring, DB, lights, fan, sockets) is now an option under Inside, off by default.
• With the defaults about 80 % of the value is SOR (steel work, thermocol, door, grill, paint, earthing) and 20 % Non-SOR (plywood, water cooler, first aid, extinguisher, signs).

## 2026.11.21-z111
Design Studio — new choice for every design: Estimate basis
• 🏛️ SOR first (government) — the default. The design takes specifications that have a schedule item wherever one fits: CPWD DSR 2023 / 2021, DSR (E&M) 2022 and MPPWD SOR 2025. Non-SOR items stay only where no SOR item exists.
• SOR + Non-SOR mix — the earlier way (market-rate items where the design needs them).
• The quantities page shows how much of the value is SOR and how much Non-SOR, so the engineer can decide what to keep.
• Across all 39 designs the SOR share went from about 60 % to about 99 % of the value. Bridges now use MPPWD SOR 2025 (superstructure concrete by grade, HYSD bars, strip seal, drainage spouts, crash barrier, bearings, wearing coat; hume pipes by diameter); sheds, drains and tanks pick up more DSR items (steel work, ridges, gutters, rain-water pipes, painting, insulation, earthing, DB).
• Gumti in SOR first: MS frame / skid / sheet / chequered plate as DSR steel work, particle-board lining, pre-coated GI roof with EPS and false ceiling, MS sheet door, uPVC windows with grill, enamel and high-albedo paint, wiring points, DB and earthing from DSR (E&M) — about 91 % SOR.

## 2026.11.21-z110
Fix — sections no longer fold up on their own:
• Picking an option in a dropdown (or ticking a box) redraws the form; the open sections (e.g. Inside, Along with the gumti) used to close each time. Now every section stays open or closed exactly as you left it.
• This works across the whole app — Design Studio, Building Planner and every new screen — without any change to each screen.

## 2026.11.21-z109
Design Studio — Portable shelter / gumti for mines:
• Height is now the TOTAL height (bottom of the skid to the top of the roof), 2.8 m by default: walls 2.0 m + pyramid roof 0.8 m.
• The door height follows the wall (1750 mm for 2.8 m total with a 0.8 m roof); the drawing shows the total height; head-room under 2.1 m is shown as a note (fine for sitting) instead of a failure.
• Plywood bench on two sides (6 seats) by default; 3 sliding windows 1200 × 600; lifting on 4 corner hooks or 1 apex hook.

## 2026.11.21-z108
Design Studio — new: Portable shelter / gumti for mines (Steel structures):
• Heat-proof cabin, 2 × 2 m, 2.8 m walls, 0.8 m pyramid roof (all sizes can be changed). Walls: MS sheet + thermocol + plywood, or PUF panel, or GI + glass wool + plywood. Roof: pyramid PUF roof, or flat with a second ventilated roof. Plywood floor on chequered plate.
• Inside: insulated door, 3 sliding windows 1200 × 600 with grill, LED lights, fan, sockets, plywood bench on two sides (6 seats).
• Lifting: 4 hooks at the wall-top corners or 1 hook at the roof apex — lug, weld, sling and frame checks, and the sling capacity to order.
• Heat gain and AC size, weight, wind (tie-down), head-room and window checks; full material list with rates; drawing (plan, elevations, wall build-up) and 3D.
• Along with it (tick what you want): AC, drinking-water cooler, first-aid box with ORS, fire extinguisher, sunshades, off-grid solar, earthing, concrete pedestals, signs, rain gutter, transport and placing.

## 2026.11.21-z107
Building Planner:
• Rental house: shops on the ground floor facing the road (give the number) — the flats to let go above.
• Farm / village house services (also for any building, under Design → Water & services): open dug well Ø 2 m with parapet and pulley (or a hand pump), kept as far from the septic tank as the yard allows; biogas plant 2 m³ (fixed dome) next to the cattle shed; 3 HP solar water pump with its PV array beside the well or bore well. All three in 2D, 3D and the services notes.

## 2026.11.21-z106
Building Planner:
• New type — Rental house (flats / rooms to let): choose how many units and the type (1 RK, 1 BHK or 2 BHK), your own 2 BHK on the ground floor if wanted, two-wheeler parking. The planner says how many units the plot can take; one stair, no lift up to 4 storeys; plain economical style.
• New type — Farm house / village house: front verandah, baithak, kitchen with store and grain store, open courtyard (aangan), bathing area, cattle shed sized by the number of animals, tractor / implements shed; traditional style with a Mangalore-tile roof.
• Outside stair along the front wall too (at the end away from the gate / car park).
• Flats in an apartment now get the BHK you asked for (before, every flat was laid out as 2 BHK).
• Fixed: a house with a sloping roof and a courtyard could stop while building in CAD.

## 2026.11.21-z105
Renovation planner — from your own drawing:
• New step "Start from": pick your CAD drawing of the house. The planner reads its floors, the top floor's size, the plot (compound wall), the toilets and the structure (RCC frame if it has columns) — no typing.
• Rules check, demolition list and cost use those figures.
• Build in CAD keeps your whole old drawing (floors marked existing, the old terrace removed as it is broken for the new work) and puts the new floor exactly on top, as a new drawing — the original stays as it was.

## 2026.11.21-z104
Interior planner — two new rooms:
• Modular kitchen: straight, L, parallel or U shape (auto fits the room). Sink unit under the window, hob with chimney on the side counter, fridge at the end nearest the door, base units in 900/600 modules, wall units above (not over the hob or the window), dishwasher at premium level. Cost with dado tiles, plumbing and electrical points.
• Toilet / bathroom: wet zone at the far wall (glass shower enclosure in a wide room, a shower strip in a narrow one), WC on a side wall clear of it, basin or vanity by the door with a mirror, geyser, towel rod, exhaust fan, floor trap. Choose the WC: floor, wall-hung or Indian.
• Cost includes wall tiles to 2.1 m, waterproofing and concealed plumbing; Build in CAD adds the tiles to the walls.

## 2026.11.21-z103
Colony layout planner:
• Odd-shaped land: choose "Odd shape — corner points", type the corners of the land and the side with the entrance road.
• Each row of plots is fitted inside the land (slanted sides, inward corners); roads are cut to the land outline and street lights stay on the land.
• The area statement, development cost, plot list and the CAD drawing use the real land shape.

## 2026.11.21-z102
Building Planner:
• Building square to a slanted side: on an odd plot choose "Building square to" the left or right side — the building lines up with that side and the road side becomes the slanted one.
• On a slanted road side the gates, gate pillars, nameplate, driveway, walkway and lawn follow the slanted line; the paving is cut to the plot outline.

## 2026.11.21-z101
Building Planner:
• Plots with an inward corner (L / T shape): draw the outline and the building goes in the biggest rectangle of the open part, keeping every side's setback.
• Outside stair for G+2 and higher: a dog-leg stair in the side setback (needs 2.5 m), with a landing and a door at every upper floor and a canopy over the top.
• New choice: outside stair along the back wall.

## 2026.11.21-z100
- CAD: .epcad drawing file export (File ▾) and “Open drawing file…” in the drawings list.

## 2026.11.21-z99
- Planner: plot from corner points (tap pad / typed) or from a closed CAD polyline; PL.normPoly, PL.isConvex, PL.edgeSetbacks (setback per side by its facing); road side chooser.

## 2026.11.21-z98
- Planner: outside straight stair (des.stairPos, cfg.outStair) in the side setback for G+1 houses, with landing, railing and first-floor door; inside stair removed from the program.

## 2026.11.21-z97
- Planner: corner plots (P.corner, side setback = front), full-width verandah porch type with columns every ≤ 3.5 m and railings.

## 2026.11.21-z96
- Planner: js/plan/plot.js — plots from four sides (+ diagonal), inset by setbacks, biggest rectangle, virtual plot for the engine; plot line / compound wall / services / lawn on the real polygon; plotArea for coverage / FAR; Full plot button. MEP bldBox ignores site walls; planner services marked pauto (kept by MEPAUTO).

## 2026.11.21-z95
- Planner modes: js/plan/p_colony.js (colony layout), js/plan/p_interior.js (room interior), js/plan/p_renov.js (renovation / extension, new floor over the old house).

## 2026.11.21-z94
- Planner modes (PL.MODES, mode bar); js/plan/p_road.js — road & drain planner (sections, BOQ with indicative rates, CAD build: road + culverts + drain walls / beds).

## 2026.11.21-z93
- Planner: PL.walkPath (gate → main door → rooms via doors / open connections) saved on A-CAMPATH after Build; entrance room gets an opening to dining / lobby / passage.

## 2026.11.21-z92
- Planner: phased construction (P.phase, PL.phaseSplit, level names “(phase 2)”, sanction note); js/plan/climate.js — PL.sunWind, PL.sunSVG; card line + report section.

## 2026.11.21-z91
- Planner: js/plan/budget.js — PL.budgetPlan (budget → options via the generator, compact variants), PL.STYLE_RATE, PL.schedule (programme + payment stages), report sections, one-page client proposal (data-plprop).

## 2026.11.21-z90
- Planner build: MEPSHEETS after MEPAUTO (per-floor E / P sheets with legends), main plans set to MEP view “Building”.

## 2026.11.21-z89
- Planner: sloped roofs round a courtyard — front / back roofs full width, side roofs hipped into them, court left open.

## 2026.11.21-z88
- Planner: sloped roofs on L / U outlines — roofWings() cuts the outline into rectangles, wings extended to the main ridge (valleys), wing roofs hipped.

## 2026.11.21-z87
- Planner: apartments try flat depths 9 / 8.25 / 7.5 / 10.5 m (PL.generate _band) and keep the fewest warnings → floors → score; fit() counts core 3 m without lift (≤ 3 storeys) / 5.2 m with; UI checks the estimate with the real generator (fitNow, cached). Flat template rounding fix.

## 2026.11.21-z86
- Planner: T.fit for apartments (flats the plot can take from FAR, coverage, height and width across), auto default + Use N button; stilt floor excluded from FAR; guard / electrical rooms only for 12 / 8+ flats.

## 2026.11.21-z85
- Planner: flat templates PL.flatTpl (outer bed/living/master, inner kitchen/dining/toilets, master lobby + attached toilet) and PL.flatTplN (narrow units) compete with band plans by score; unit plans no longer penalised for the entrance via dining; phone overflow fix on type buttons.

## 2026.11.21-z84
- Planner: outdoor lights (door, walls, gate, path, garden), granite nameplate (gate / door, text from Sanction details), car ramp to porch/parking (1:10, min 1:6), land at NGL.

## 2026.11.21-z83
- Planner: RWP → recharge pit underground lines (ring route, plot-bounded), paver driveway + wicket path + lawn, 750 mm PCC plinth protection (land entities), colour by floor (ground / top / alternate). Options paving, apron, paintFloors.

## 2026.11.21-z82
- Planner: meter board at the gate + 2 earth pits (≥ 5 m apart, IS 3043); parking bays 2.5 × 5 m with cars, aisle, two-wheeler bays; terrace drainage — RWPs at convex corners (1 per 40 m²) and SLOPE 1:100 leaders. Options: meter, roofDrain, park.

## 2026.11.21-z81
- Planner: Water & services group — RWH recharge pits (MBBL 2016, plots ≥ 100 m²), septic tank + soak pit (IS 2470) or sewer manhole, underground sump, bore well away from the septic tank, solar water heater; notes in the sanction text. New assets rwh_pit and solar_water_heater.

## 2026.11.21-z80
- Planner: paint colour schemes (outside/inside), front screens (louvre, fins, charcoal, stone), compound wall grill and gate pillars, premium interior panels.

## 2026.11.21-z79
- Courtyard: spaces court (open "court", circ, ground) and void (upper floors); band layouts keep fixed items per row (stair and court → void) on every floor (fillRows / bandFloor take a fixed list); court is never stacked, goes to the middle of its row, marked down when it touches the outer wall; rooms beside it count it as an outer wall for daylight. Builder: no room entity for voids, slab holes over court / voids on every floor, parapet round the court on the terrace.
- Design items entry (steps / steps + ramp / none), terrace (solar / pergola / both), stairType (dog-leg / winders). Builder: steps entity from NGL to plinth in front of the porch or a 0.9 m landing, ramp 1 : 12 with a 1.5 m landing beside the steps (turns left if it would leave the plot), solar_array_4 assets on free terrace (2 for houses, 8 otherwise), pergola in a free corner, stair.winder "3".
- Planner: change a selected room's kind (any space) or rename it; preset "Courtyard house".

## 2026.11.21-z78
- js/plan/design.js: PL.DES (27 design items in 5 groups, every option an existing CAD library entry), PL.STYLES (8 styles), PL.desDefault, PL.PREMIUM furniture map.
- build.js uses cfg.des: wall material / thickness (brick 230, block 200, stone 300 outer), main / room / toilet door presets, arch heads on the main door and road-side windows, window preset + grill, balcony railing style, parapet style, floors by room kind, wall finishes per wall piece (toilet tile / dado, kitchen band 850–1450, front cladding on the outside face, s0 / s1 limited to the room), czone false ceilings in living / dining / master / halls, sloping roofs (RCC gable / hip without the flat slab; tile roofs over the flat slab; no terrace stair / mumty / parapet), porches in the front setback (slab or curved slab, round / square / octagonal columns with footings, gable porch roof, dome), curved or three-sided bay windows (straight wall split, curved / faceted chain with windows, floor + ceiling bulge slabs), curved balcony railing + slab, columns at the free corners of open rooms, compound wall height / no wall, sliding gate (opening + asset) or opening, garden assets; premium furniture swaps, modular kitchen, IWC / EWC mix, shower cubicles; deleted entities (_del) dropped at the end.
- FIX placeOn: scans from the preferred spot in 50 mm steps for the nearest free position (columns at the piece ends and mid-span used to block every candidate → main doors missing on front walls over 4.5 m).
- FIX main entrance: falls back main room → corridor → hall → any front room; school office, hostel visitors' room and HWC waiting marked as the entry.
- ui-plan.js: section 5 "Design and items" (style buttons + grouped selects saved per building type), design summary on each option card.

## 2026.11.21-z77
- PL.moveEdge(plan, floor, uid, side, δ): moves one grid line of a room; every room touching that line within the connected run moves with it (closure over overlapping spans), attached-toilet cuts follow, refuses outer walls, the stair / lift on multi-floor plans, and rooms going under 0.9 m. UI: selection panel with ◀ ▶ ▲ ▼ wall buttons (15 cm), score / checks / stats recomputed.
- PL.rulesFor("cg", "res"): ≤ 90 m² F 1.5 / 0 / 0 / 0, cov 75 %, FAR 1.5; 90–250 F 2.0 R 1.5 one side 1.0, 65 %, 1.5; 250–500 F 3.0 R 2.4 sides 1.5, 50 %, 1.25; > 500 kept from the earlier table — source: published Raipur summary of CG BVN 1984 (amended Dec 2024); to be checked against the gazette.

## 2026.11.21-z76
- spaces.js: types apartment (flat units {unit:{beds,attached}}, stilt), shops (sp.shop → RS shutter on the road side, scored like parking), factory (T.roof "gi": gable GI roof instead of the top slab, no parapet), anganwadi, panchayat, hwc; rules kind "ind"; ~20 new spaces.
- layout.js: PL.corrU (wings at both ends, six bands) + PL.uNeed, chosen when L does not fit; PL.expandUnits lays every flat out with the house programme inside its rectangle (band search, unitExt "b" scoring, cached per size, entry from the corridor), apartment ground-floor leftovers → stilt parking; 'up' rooms spread over all upper floors; floors loop keeps the least-bad result when nothing fits; PL.checks: travel to stair (30 m, 45 factory), 2 stairs over 500 m² or 15 m, 15 m fire NOC, hospital ramp / bed lift, cross ventilation %, west-only bed rooms; LR core offered from 24 m; svg: data-plroom + selection.
- build.js: openings from passages / lobbies / corridors into the circulation they join (houses had passages with no way in); shop shutters; frame sizing (tributary area to the nearest columns, 11 / 13 / 8 kN/m² per floor, M20 Fe500 0.8 %, footing from SBC, D ≥ B/4, beam D ≥ span/12) → d.planner_frame; sanction text block (owner, address / khasra, ward, architect, reg) + setback dims on layer DIM.
- ui-plan.js: presets for apartment / shops / factory; SBC field; sanction details; swap two rooms by tapping; Report / PDF (window.open, else .html download) with plans, room schedule vs NBC minimums, Vastu table, rules, checks, floors −1 / +1 comparison; column schedule in the drawing set.

## 2026.11.21-z75
- FIX: js/version.js EP_NOTES of z74 had raw newlines (re.sub turned "\\n" into a line break) → the file threw a syntax error on load; notes written with escaped \n again.
- Planner L-shaped corridor buildings (PL.corrL, PL.lNeed): wing A along the road + wing B at the right / left end, core at the corner, four bands (front A, back A, wing B both sides, corridor A continues into wing B); chosen when a straight block does not fit the plot width but the L fits depth and coverage. plan.outline polygon → slabs, parapet, SVG outline, built-up area (PL.footArea); score uses true outer-wall length (PL.extLen) for shaped plans; mumty door side tested against the outline.
- Ready patterns (ui-plan PRESETS): 1BHK, 2BHK, 3BHK, 3BHK / 4BHK duplex, row house (no side setbacks), bungalow, small / 100-staff office, primary / higher secondary school, PHC / CHC, guest house — one tap sets plot, needs, floors (+ small sizes) and makes layouts.
- Build adds: compound wall on the plot line (layer A-SITE, 230 mm, from NGL to +1.8 m, just "r" inside) with a 3 m vehicle gate and 1 m wicket gate on the road side; chajjas 600 mm over every outer window at lintel top; drawing set after MEP: elevations + section (site layer hidden while drawn), DIMWALLS on every floor (dims tagged with their level), door / window and room schedules, area statement beside the plot, SHEET (all elevations).
- Kitchen without an outer wall marked down more (15).

## 2026.11.21-z74
- New tab Building Planner (js/ui-plan.js, tab id `planner`; nav regrouped with `.tab-grp` separators: Estimates/Reviews | Planner/CAD/Design | rates | photos/scanner/backup | users/help).
- js/plan/spaces.js: space catalogue (≈110 spaces, S/M/L sizes, NBC minimum areas / widths, zones, wet, light, Vastu prefs, furniture set) and 9 building programmes (house, office, school (CBSE), college (AICTE), hospital (IPHS CHC), hotel (MoT star sizes), hostel, canteen (DoPT scale), community hall); toilet blocks from NBC Part 9 fittings per floor (PL.blockFor), indicative setback / coverage / FAR / height table (PL.rulesFor).
- js/plan/layout.js: floor allocation (ground-preferred overflow, zone order), band layouts (row-depth search over all floors, passage row, stacked small rooms, attached toilets carved from a corner, stair fixed on every floor), corridor layouts (single / double loaded, core L / R / C / both ends, same core every floor, rooms not stacked, long rooms split), scoring (proportion, least width, area kept, outer wall, access, kitchen–dining, wet together and stacked, entrance on the road, Vastu octants), best 4 distinct; PL.svg plan cards.
- js/plan/build.js: PL.toDoc → CAD doc (plot + setback lines, levels + terrace, walls merged from room edges 230 / 115, doors by access rank, openings for stairs / kitchen, windows by 1/10 rule, rooms inset to wall faces, dog-leg stairs fitted to the room and slab wells, mumty + parapet, columns / beams / footings, furniture); PL.autoRun runs a CAD command with canned answers (used for MEPAUTO, ELEVATION All, SECTION through the stair).
- Verified in the harness: all 9 types build (stairs inside their rooms), MEP + sheets + elevations + section run on the built house.

## 2026.11.21-z73
- cycle_shed (modules_extra6): schemes + "Two rows – duo-pitch (gable)" (K gable: two-post rafter, ridge, Hp = H) and "One row – Y / butterfly" (K Y: like T, valley at the posts); flags TWO / BOTH; duo-pitch canopies cpu 1.2.
- New checks: largest purlin spacing for the sheet under edge uplift (limits the purlin spacing); rafter–post joint (two rows: seat + 2-M16 / weld vs uplift + shear; one row / cantilever: rigid joint — rolled: cap plate bolts 4.6 → 8.8 and plate thickness, flange welds; tubular: weld ring with 4 stiffeners when the wall is too thin); post–base weld (same; tubular posts are picked so the weld fits the wall; IS 800 cl 10.5.2.3 min 5 mm but ≤ wall); anchor bolts 4 × 4.6 → 4 / 6 / 8 × 8.8; base plate grows for bearing; bracing rods from longitudinal wind (friction + end frame) and SHS eave tie as a strut; screw pull-over / pull-out at the edges (every crest if needed); footing one-way and punching shear; pedestal steel 0.5 % gross (IS 456 26.5.3.1(h)).
- Larger tubes: SHS 180 / 200 / 250, RHS 250×150 / 300×200.
- Gutters (non-SOR 0.5 mm pre-coated) + uPVC down pipes 12.41.2 and shoes 12.42.6.2 (param gutter, default on); solar panels +0.15 kN/m² (param solar).
- Drawing: roof line per pattern, purlins, gutters, knee brace, side elevation of every bay (≤ 10) with both braced end bays, eave tie; joint detail beside the base detail; notes list joints, bracing, screws, gutters. 3D: gable / Y roofs, gutters with down pipes, solar panels.
- 50 variants (5 patterns × 2 member types × 5 load / size cases) run: no failures except a 9 m cantilever at Vb 55 (warned).

## 2026.11.21-z72
- steel_shed: span min 6 → 3 m, eave min 3 → 2.4 m (all six styles checked at 4.5 m span × 5 bays @ 6 m, eave 3 m: design, free, quantities and 3D run).

## 2026.11.21-z71
- New `js/bim/runs2.js`: run kinds groove_v / groove_u / groove_band (key run_groove, band ×3), look groove_dark; RUNWALL (whole wall face from the picked side, or round a room inside it; runs with z < 2.2 m are split at door / opening gaps on the room's sides); RUNPROFILE (closed polyline section → stacked bands, saved in `bim.runProf`, registered on use by wrapping run plan / mesh / qty / labels).
- DWG: `server/dwg` (Dockerfile building LibreDWG 0.13.3 dwg2dxf, Node service POST /convert with x-key, 40 MB, 3 at a time, temp folder removed); worker `/api/dwg` (GET configured; POST checks the Supabase sign-in and "AC10" header, forwards to DWG_URL with DWG_KEY); CAD Import / Open accept .dwg and convert first. Not configured → a clear message.
- Fix: ALIGNWALL picked through getEnt now reads `.e`.

## 2026.11.21-z70
- New `js/bim/ceil.js`: element `czone` (CEILZONE) — kinds gypsum / grid / wpc / wood / acp / baffle / louvre (`B.CZ_KINDS`), underside `z` (else `B.fceilH` of the room), `dir`, `pw`, `gap`, `start` corner, `slope` (planks step up across it), fascia to the soffit where it steps (not when sloping); plan dashed outline + layout lines; qty area ÷ cos(slope) + fascia; keys grid_ceiling (12.45.3), wpc_ceiling, wood_ceiling, baffle_ceiling, louvre_ceiling (non-SOR), acp_panel, false_ceiling. Properties in ui-assets. `ALIGNWALL`: selected assets turned square to the nearest wall (front = local +y away from it) and set against its face (any angle; one-face walls handled).
- view3d: "More shadows" 16 more fittings (4 × 4 tiles of 512 in 2048²) — 17 shadowed fittings; SSR rays that leave the screen return the blurred edge colour at 0.35 (horizontal reflections only); drive paths: `mv.stops` (gates gate_ms / sliding / collapsible / rolling within 3 m of the route, mesh.js) — slows and waits 3 s 3.5 m before.
- runs.js: open kitchen base runs show a corner carousel (pole, two wire trays) at inside corners.
- ui-assets: material picture "⧉↻" = copy turned 90° (8 slots allow both); My 3D models get a 112 px flat-shaded iso thumbnail when added (`B.glbThumb`).

## 2026.11.21-z69
- to3d_b3: builder `cycle_shed` (the only Design Studio module that had none): all three schemes (two rows mono-slope, T with ridge on the post line, cantilever Γ with knee braces), tubular (SHS / RHS boxes) or rolled (ISMB I-sections, ISMC as boxes) read from the result summary, base plates, pedestals and footings from the summary, purlins at the designed spacing, roof sheet; extras: floor slab (paver look), kerb, stands. Checked: Design Studio → Open in CAD gives one dsmodel with 308 parts and renders.

## 2026.11.21-z68
- CAD full screen: after requestFullscreen, `navigator.keyboard.lock(["Escape"])` (Chrome / Edge) so Esc reaches the command line; unlocked when leaving. Other browsers: the Esc button on the status bar.

## 2026.11.21-z67
- Own material pictures: 8 slots (shader uTx0…uTx7, uTxR[8], patterns 20…27; units 2–6 and 13–15); `B.regTex` / `B.addTex` limits 8; unique picture ids (two added in the same millisecond overwrote each other).
- `B.EXT.model3d.plan`: convex hull of the model's points from above (cached `g._hull`, ≤ 64 corners, sampled to ~40 000 points) with a small centre cross; the box remains only while the model is loading.

## 2026.11.21-z66
- CAMPATH keywords Look (`bim.camLook` [x, y] mm; Tour turns to it) and Doors (`bim.camDoors`, default on): at Tour start doors within 0.9 m of the path get `open: "90"` (restored and rebuilt at the end / on stop via `C.v3tour.restore`).
- view3d: `_skyTex` averages the sky / horizon / ground bands of the background picture (32 × 32, linear) into `t.amb`; `light()` with sky kind 5 mixes them into ambient sky / ground / horizon and tints the sun (`picLight !== false`).
- CURVEDWALL stores `cc` / `cr`; `B.plan` wrap (tools.js) turns the face lines of curve pieces into arcs round the centre (older pieces find it from the next piece) and drops joint lines between pieces of the same curve.
- ui-assets: device library `localStorage["ep.matlib"]` (≤ 24, fewer if full); every added material picture is kept; Library panel lists them (click = add to this drawing, ✕ = remove).

## 2026.11.21-z65
- Door `frm`: "" 50 × 100, slim 40 × 75, heavy 75 × 125, stone 50 × 150 (granite look, key `stone_door_frame` → non-SOR), none (no frame boxes, no frame row). Door kind `double_fixed` with `fixR` (0.2–0.5, default ⅓): plan shows one swing arc + the shut fixed leaf; 3D opens only the main leaf. Schedule: horseshoe arch, frame type, "double, one leaf fixed".
- assets9: part type "br" (box turned by its own angle); `B.chairParts(x, y, a, style)` / `B.CHAIRS` (plain, uph, arm, cane, stool, metal); `dining_p` takes `chair` and `ends`; new `dining_round_p` (chairs all round, `seats`), `sofa_bed_p` (var open), `recliner_p` (1–4 seats by width, var open = footrests up).
- Window grill `scroll`: bars at 300 with a pair of mirrored C-scrolls in each square, weighed (flat 0.62 kg/m).

## 2026.11.21-z64
- 3D lights: light entries may carry [5] direction and [6] cosine of the beam edge (`B.lightBeam` in assets.js: spots / downlights / COB / track ↓ 0.55; uplights / spike / façade spots ↑ 0.72; wall-mounted lights into the room (local +y) −0.35 z, −0.15; Properties `beam` auto / down / all / front / back and `beamCos`). Shader `uPLd[32]` with a smoothstep cone.
- Lamp shadows: the shadow camera looks along the beam (`lampVP`, near 0.2); "More shadows" now the next eight fittings (2048 × 1024, 4 × 2 tiles of 512) with 9-tap filtering — nine shadowed fittings in all.

## 2026.11.21-z63
- mep2.js part 5 (`B.mepServices`, run by PLUMBAUTO / MEPAUTO after the floors, all `mauto`): PVC overhead tank on the top level at the riser group (capacity = design OHT) with CPVC Ø32 feed to each riser; septic tank (`sep` = IS 2470 size for the persons) 3.5 m in front + soak pit + S.W. outlet; drain ends at the septic inlet end; rain-water pipes `rwp_110` with `rwp:true`, max(2, ⌈roof m² / 40⌉), corners first.
- Quantities: septic tank as excavation 2.8.1, PCC 4.1.8, brick 6.1.1, plaster 13.4.1, RCC 5.1.2, shuttering 5.9.3, steel 5.22A.6, filling 2.25 (CPWD 2023); soak pit 19.33 (≤ 10 persons) or 19.32.1; RWP vertical length roof → ground + 0.45, shoe 12.42.6.2, grating 12.46, clips 12.43.2 per 1.8 m; meter board → main DB cable and main DB → upper DB sub-mains (E&M 1.14.4 / .5 / .6 by load), earth pit → meter board 5.12.
- mep.js: manholes drawn on the plumbing-layout plan of drains (they were missing when the service drawing was on).

## 2026.11.21-z62
- New `js/bim/mep2.js` (after mep.js; in the service-worker cache): MEP part 4.
  - `PLUMBAUTO`: per floor, rooms holding sanitary items (`B.pclass`: WC / W / SH / FT / GY / STACK / RISER) get a soil-and-vent stack (`vent_pipe_110`, `stack:true`; in line with a stack on another floor, else at the room corner nearest the outside), a CPVC riser (new item `cw_riser`), a floor trap if a toilet has none; soil Ø110 WC → stack, waste Ø75 fixtures → floor trap → stack (sinks direct), CW tree from the riser (Ø20 first leg, Ø15), HW tree from the geyser. Ground floor: house connection from each stack to a ring 1 m outside the building and S.W. drain(s) along it (`mh: 30`, manholes at ends / bends / junctions) to a septic tank or manhole outside, else the front. Everything it lays has `mauto` and is replaced on the next run.
  - Stack / riser quantities are vertical lengths: to the floor above where a stack / riser is in line there, else to the top level + 600; a stack with none below also runs down to the ground floor.
  - `MEPAUTO`: asks group, persons (`d.mep.pers`) and All / Electrical / Plumbing; runs POINTSAUTO and WIREAUTO for every floor with rooms (new `{auto, lvl}` option, no questions), meter board + two earth pits outside the wall nearest the ground-floor DB (`eauto`), PLUMBAUTO, MEPSHEETS.
  - `MEPSHEETS`: per floor an electrical and a plumbing sheet to the right of the drawing: a copy of the floor plan made with only that service (`B._mepViewOv` overrides the view while copying; labels and room names included), title + scale, legends (Electrical + Single line / Plumbing + Isometric), frame on A-SHEET and a layout entry (`mep:1`, numbers E-01 / P-01 …, paper A3–A0 to fit; small plans drawn at up to 2× i.e. 1:50). Copies refresh via `B.refreshDetails` (Update views and before plot). `isViewEnt` treats `mepsh` objects as sheet furniture.
  - SCHEDULE → Plumbing adds "Water supply and sanitation design": 135 L/person/day, overhead tank and sump one day's demand, septic tank from the IS 2470 table, fixture units, pipe sizes.
- mep.js: view override, POINTSAUTO / WIREAUTO `{auto, lvl}`; ribbon: Plumbing [PLUMBAUTO …], MEP drawings [MEPAUTO, MEPSHEETS …]; help 18E-2.
- Tested on a two-floor house: 40 points, 10 circuits, 27 pipe runs, 4 manholes, 4 sheets; refresh and re-run work.

## 2026.11.21-z61
- New `js/ds/extras.js` (after all modules in ui-design FILES; in the service-worker cache): "Along with the design (साथ के काम)" — a last input group added to chosen modules; after the module runs its quantities are appended and a summary line "Along with the design" is added. `DS.extras.EXTRA[id] = { params, add(inp, res) → { q, s } }`; spec.params mutated in place so defaults include the new keys; errors become a warning, never a failed design.
  - cycle_shed: floor (paver 60 mm M35 + GSB 100 → 16.91.1 / 16.78.2; paver 80 mm M30 + GSB 150 → 16.91.2; PCC 1:2:4 100 → 4.1.3; CC flooring 40 mm on PCC 1:4:8 → 11.3.1 + 4.1.8; hardener floor 52 mm → 11.4 + 4.1.8; excavation 2.8.1), precast kerb 100 × 300 round the floor (16.69), PCC saucer drain 450 × 75 along the open side, two-wheeler stands (one per 0.9 m, two rows when W ≥ 4 m, non-SOR ₹1,500), LED battens one per bay (E&M 1.10.3 point wiring, 1.35 installation, fitting non-SOR ₹900, circuit wiring 1.14.1). Defaults on: paver 60, kerb, drain, stands, lights.
  - steel_shed, steel_portal, steel_truss: floor (same list, default none), plinth protection 900 wide (4.17), LED high-bay 100 W about 1 per 50 m² (non-SOR ₹6,500 + E&M items).
  - boundary_wall: main gate width (default 4 m) and wicket gate — MS gate ≈ 30 kg/m² (10.25.2) + painting both faces (13.61.1).
- ui-design `mapItem`: links to "DSR_EM_2022" / "em22" go to the E&M 2022 book.
- Checked in the app: parking shed shows the group, the summary line and the items in Quantities → Estimate.

## 2026.11.21-z60
- `POINTSAUTO` (Site & services → Electrical → Points by room): for every room of the floor without electrical items — by name: toilet / bath (1 light, exhaust, 16 A geyser point), kitchen (lights by area, 2 × 6 A, 16 A, exhaust), store / passage (1 light, 1 socket), others (1 light per 10 m² on a grid, 1 fan or 2 over 20 m², 6 A sockets 1 per 8 m² min 2, 16 A over 12 m²); switch board beside the door (door found on the room edge), wall items on the other edges facing in; a DB beside the switch board of the largest room if the floor has none. `B.mepRoomPlan(doc, room)`.
- `SCHEDULE` → "Single line": per DB — supply, DP incomer, RCCB (if set), busbar, outgoing MCBs with circuit, rating, cable, load and points; connected load, demand factor 0.75, current at pf 0.9, incomer 32 / 40 / 63 / 80 A and cable 2 × 6 / 10 / 16 / 25 Cu; three-phase advice over 7 kW. `B.mepCircuits(doc, db)`.
- `SCHEDULE` → "Isometric": pipes at their real heights (drains falling at their slope) in 30° isometric, service colours, vent stacks to 600 above the roof, rain-water pipes from roof to ground, drops to fittings within 450 mm of a pipe end, size labels.
- 3D: ewire conduits (up from the item to 60 below the ceiling, along the arc in 6 pieces, down) while the electrical layout is on and not hidden by MEPVIEW.
- Tested in the app: 3 rooms → 20 items + DB, 2 lighting + 3 power circuits, 3.98 kW → 32 A incomer; isometric and 3D on the sample.

## 2026.11.21-z59
- `cycle_shed`: new input "Member type" — tubular (SHS / RHS, as before) or rolled ISMB / ISMC (IS 808, E250). Rolled: purlins lightest ISMC (gravity with the top flange held by the sheet, uplift with LTB over the bay, L/150); rafters lightest ISMB / ISMC (gravity LLT = purlin spacing for two posts or the arm for a cantilever, uplift LLT = span / purlin spacing, L/180 or L/90); posts ISMB / ISHB ≥ 125 deep (IS 800 compression Kz 2.0 / Ky 1.0, bending with LTB over 2H, combined cl 9.3.2.2) — all with the DS.steel routines. Steel item 10.1 instead of 10.16.3. Module renamed "(tubular or rolled)".
  - 30 × 4.5 m, two rows: ISMB 125 posts, ISMC 125 rafters, ISMC 75 purlins, 2.72 t (20.1 kg/m²); T: ISMB 200 posts, 2.68 t; cantilever: ISHB 200 / ISMC 250, 4.04 t. Tubular unchanged (1.83 t).

## 2026.11.21-z58
- Design Studio: new module `cycle_shed` (`js/ds/modules_extra6.js`, added to ui-design FILES and the service-worker cache) — two-wheeler / cycle parking shed in hollow sections (IS 4923 SHS / RHS, properties from outer size and thickness with square corners [approx 2–5 % above the tables]).
  - Schemes: two rows of posts with a mono-slope roof (rafter on two posts, fixed bases), one row of posts with a T roof (rigid post-top joint, unbalanced and wind cases), one row cantilever.
  - Loads: IS 875-2 roof live load, IS 875-3 design pressure with canopy net coefficients +0.5 / −1.3 (T −1.2) for frames and −1.8 for purlins [approx — Tables 17 / 18 to be verified], horizontal = inclined pressure + friction.
  - Members (lightest passing): purlins (bending, shear, L/150), rafters (L/180, cantilever L/90), posts SHS (K = 2.0, curve b, N/Nd + M/Md ≤ 1); base plate from the actual bearing pressure (IS 800 cl 7.4.3.1), 4 anchor bolts 4.6; isolated footing for bearing (1.25 SBC), overturning (FoS 1.5) and uplift (weight ≥ 1.5 × uplift); footing steel by `designStrip`.
  - Quantities: tubular steel cpwd 10.16.3, plates 10.2, rod bracing 10.1, HD bolts 10.19, sheet 12.50, painting 13.61.1, excavation, PCC, RCC, shuttering, rebar, grout, back-fill. Drawing CS-01 (cross section, front elevation, base & footing). Design mode only.
  - 30 × 4.5 m, Korba wind: two rows → SHS 80×80×3.2 posts, RHS 122×61×3.6 rafters, RHS 66×33×2.9 purlins, 1.83 t (13.5 kg/m²); T → SHS 113.5 posts, 1.80 t; cantilever → SHS 150 / RHS 200×100, 2.79 t. Checked in the app (Design Studio runs it, PASS, drawing renders).

## 2026.11.21-z57
- New `js/bim/mep.js` (after site.js; in the service-worker cache). Electrical and plumbing drawings in CAD Studio.
- Electrical: `d.mep = { on, grp A|B|C, cond pvc|steel, sw mod|piano, ckt 1.5|2.5|4, sym, rccb, view }` set by `ELECSET`. Library items are classed (light, fan, exhaust, bell, 6 A / 16 A socket, TV, switch board, regulator, DB, meter board, earth pit, AC); with symbols on they draw IS-style symbols at paper size (2 × scale). New items: earth pit (→ em22 5.2), meter board.
  - `ewire { a, b, k pt|ckt|pwr, c, bend, lvl }` on layer E-WIRE, an arc between two items (follows them when moved); circuit wires carry ticks and the circuit name. `WIRE` (by hand: From, Flip, Circuit), `WIREAUTO` (per floor: points → switch board of the same room or nearest within 6 m; boards chained to the nearest DB, circuits ≤ 10 points / 800 W; each 16 A socket its own P circuit).
  - Quantities when on: point wiring per point by group / conduit / switch (em22 1.1, 1.3, 1.8, 1.10; twin control 1.2, 1.4, 1.9, 1.11), 6 A box 1.31 / 1.29, 16 A box 1.32 / 1.30, power plug wiring m 1.12 / 1.5, circuit wiring m 1.14.x / 1.7.x (arc + drops from 150 below the ceiling to each item), DB 2.3.x by ways (circuits + 2), MCB SP 2.10.1 per circuit, DP incomer 2.10.3, RCCB 2.14.2, bell 1.38, TV 1.24.7 / 1.23.7, regulator 1.25. Switch board and the old light_point / fan_point / socket / db rows are dropped (included in the above). Off → exactly as before.
  - CPWD groups A/B/C are building categories (A Type I–III quarters, B Type IV and above, C non-residential), not lengths.
- Plumbing: pipe runs get `svc` (cw, hw, soil, waste, vent, rw, drain). `PLUMB` draws them (CPVC 15–32, uPVC 75/110, S.W. 100–200; layers P-CW … P-DRAIN; heights per service). With `d.mep.plb` they draw as service lines (dashed for waste, vent, rain), "Ø… SP 1:40" labels and flow arrows. uPVC bends (> 30°) and tees (a pipe end on another pipe, away from its ends) → cpwd23 12.42.5.x / 12.42.4.x. New item: gully trap (19.4.1.1).
- `MEPVIEW` (all / E / P / B) hides the other services in plan, sheets, PDF and DXF; quantities always count everything.
- `SCHEDULE` → Electrical (legend with symbols, DB schedule with circuits, points, load, MCB, cable) and Plumbing (pipe schedule by service and size, bends / tees, sanitary fittings and traps). views2d exposes `B.SCH_KINDS` and `B.SCH_EXTRA`.
- Properties: twin control, socket 6 / 16 A, load, circuit, DB name; pipe service and fall. Ribbon: Site & services → Electrical, Plumbing, MEP drawings. Help 18E-2.
- Tested in the app on a two-room sample (auto wiring, manual wiring, settings, off, schedules, plumbing pipes, fittings, layout switch). Not yet: single-line diagram, toilet isometric, wires in 3D, two sheets with different layouts at the same time.

## 2026.11.21-z56
- Home page: the Android card no longer mentions Google sign-in (owner's wish). The app itself still explains it when Google's page is opened.

## 2026.11.21-z55
- Android app rebuilt as its own WebView app (`android/app/src/main/java/com/vividbrandify/estimatepro/MainActivity.java`); Chrome is no longer needed. Replaces the Trusted Web Activity of -z53. Only dependency: androidx.core 1.13.1 (FileProvider).
  - Downloads: blob/data downloads are passed to `EPAndroid.save` and written to Download/EstimatePro (MediaStore on Android 10+, storage permission on 6–9) with Open / Share; http downloads go to DownloadManager.
  - Web Share → Android share sheet (one or many files + text); `window.print()` and print-preview windows (`window.open("")`) → Android printing / Save as PDF. Pop-up windows open in a full-screen layer with Close and Print.
  - File inputs (filtered by `accept`, camera option when allowed), camera for the in-app camera / scanner, GPS — each asks for the Android permission when first needed, only for the app's own site.
  - Links: own site and Supabase stay in the app; everything else (wa.me, tel:, mailto:, other sites) opens in the phone's apps. Google's sign-in page is refused inside apps by Google, so the app explains and returns to the sign-in screen (email or WhatsApp code).
  - Links to `/app` open the app (verified app link via `.well-known/assetlinks.json`, made by the first workflow run). Adaptive icon from `icon-maskable.png`. User agent ends with `EstimateProAndroid/<version>`; Devices shows "Android app".
- `js/ui-android.js` (loaded right after config.js, cached by the service worker): when `window.EPAndroid` exists, routes `<a download href=blob:…>` clicks, `navigator.share/canShare`, `window.print` and the print hook of opened windows to the app. Tested in a page with a stand-in bridge. The Android code was checked for syntax only — it has not been compiled (no Android SDK here; GitHub Actions blocked by billing).

## 2026.11.21-z54
- Home page download buttons ask the GitHub API which files are in the `apps` release; a missing file shows "Available soon" instead of a dead link, a present one shows its size. If the API cannot be reached the links stay as they are.
- 24 Nov: every GitHub Actions run of this repository fails before starting ("recent account payments have failed or your spending limit needs to be increased"), so neither app has been built since. Owner must fix Billing in GitHub, then run both workflows.

## 2026.11.21-z53
- Home page (`index.html`): Screens section (slider of real screenshots from `/updates` and `/help`, changes by itself, thumbnails), Download section (Windows, Android, browser; animated devices picture), five new feature cards, "new in 3D" row in the CAD section, Download links in the nav, hero and footer. Download cards use `.dlg` (`.dl` is already an animated part of the "live" strip).
- Download buttons point to GitHub release `apps`: `EstimatePro-Setup.exe`, `EstimatePro-Portable.exe`, `EstimatePro.apk` (`…/releases/download/apps/<file>`). These links work only while the repository is public; a Worker asset cannot be larger than 25 MiB, so the Windows files cannot be served from the site itself.
- `android/`: Trusted Web Activity (package `com.vividbrandify.estimatepro`, androidbrowserhelper 2.5.0, AGP 8.5.2, Gradle 8.7, min Android 6) opening `/app?src=android` in the phone's Chrome. `.github/workflows/android-app.yml` builds and publishes it. Needs the repository secret `ANDROID_KEY_PASSWORD` (16+ characters); the first run makes the signing key (PKCS12, protected by that password) and commits `android/estimatepro.keystore` and `.well-known/assetlinks.json`. Not built or run from here.
- `windows-app.yml` now also publishes the two .exe files to the `apps` release (fixed file names). Publisher "Vivid Brandify", copyright Vividbrandify.
- `wa-outbox` (Supabase edge function, not in this repository) was changed by the owner on 24 Nov: 2 messages per run, 55 s wait per message, `typing:false` — Relay's API gap (15–25 s) plus typing went past the old 30 s limit.

## 2026.11.21-z52
- The Cloudflare Worker now has a script: `worker.js` (`main` in `wrangler.jsonc`, `assets.binding` ASSETS, `run_worker_first` ["/api/*"], `keep_vars`). Everything outside `/api/*` is still served as static files; `worker.js` and `wrangler.jsonc` are in `.assetsignore`.
- `POST /api/wa-estimate` (body = the .xlsx; headers `authorization: Bearer <Supabase access token>`, `x-which`, `x-name`, `x-file`): checks the user with Supabase, reads `profiles.phone` with the user's own token, uploads the file to Vivid Relay (`POST /api/media`), sends it as a document with the caption (`POST /api/sessions/{name}/send`, `typing:false`), deletes the library copy. The message is written on the server (name cleaned of links and formatting, 100 characters), the recipient is only the user's own number, files up to 8 MB that start with "PK", about 20 a day per user (edge cache). `GET` answers `{ok, configured}`.
- Needs in the Cloudflare dashboard: secret `RELAY_KEY` (a Vivid Relay API key); optional text variable `RELAY_SESSION` (else the first connected number of the key). Without the key the endpoint answers `not_configured` and the app quietly uses the share sheet.
- `ui-est.js` `sendWa`: server first (45 s limit), then share sheet / wa.me as in -z51; after a failure the button goes straight to the share sheet for two minutes.
- Tested with stand-in services (node for the worker, the harness for the page). Not tested against the real Relay or the real Supabase.

## 2026.11.21-z51
- `ui-est.js` Export: button `data-xlwa` beside each download. `sendWa(which)` builds the same workbook, copies the message to the clipboard, and uses the Web Share sheet with the file and text when the device can share files; otherwise downloads the file and opens `wa.me/?text=`. `waText` — Hindi + English, names the estimate and the work, ends with the app link. Logged as an export.
- Nothing goes through the server: sending the file by itself to the user's number would need the wa-outbox function to accept media (it sends text only today).
- Harness: share sheet stubbed → file "…​.xlsx" 29.6 kB with the message; fallback → download + wa.me link.

## 2026.11.21-z50
- Phone layout (≤ 820 px), from the owner's screenshot where the plan had shrunk to a strip and the 3D toolbar covered the 3D view: `.cad-host` height 100dvh − 64 px (was 100vh − 150); `.cad-log` one line; split view gives the plan flex 1.25 / min 170 px and 3D flex 1 / min 150 px; `.v3-bar` shows only the new `.v3-more` button until opened (then scrolls inside the pane, above the cube); `.vcube-wrap` scaled to 58 %. `ui-bim.js`: the toggle button and its handler. Wide screens unchanged.
- Checked at 390 × 760: plan 190 px, 3D 192 px, tools closed / open / full 3D.

## 2026.11.21-z49
- `view3d.js`: `lampShadowAll` (toolbar toggle "More shadows", off by default) — the three fittings nearest to the view after the first are rendered looking down into the tiles of one 2048 × 2048 depth picture (texture unit 12; `uLS4`, `uLS4m[3]`, `uLS4p[3]`, `lampSh4`); the light loop dims each of them by its own tile. Costs three more depth passes of the opaque geometry per frame. A failure switches lamp shadows off as before.
- Harness: four ceiling lights, three sofas, night — toggle on gives three extra maps, frames differ, no GL error, program links. Frame time could not be measured here (software renderer).

## 2026.11.21-z48
- Curved walls stay a chain of short straight walls (`curve: 1`), so everything hosted on them keeps working; `mesh.js` now shows the chain as one surface: `B.curveOf(doc, w)` finds the circle from the neighbouring piece and which ends join; the side-face normals are set radial, the vertical and top edges at joints are dropped, and the end faces at joints are not drawn. Plan view unchanged (facets of about 400 mm).
- Harness: half circle of radius 3 m in 24 pieces — no joint lines close up, with or without shadows.

## 2026.11.21-z47
- `bim.js` `stairGeom`: U stair with `winder` "3" (twelve risers or more) — treads / three winders / treads / three winders / treads, the last flight never longer than the first; returns `runs`, `windRail` (two pieces round each corner), `U0`, `W2`, `ua`. `stairOutline`: when the last flight ends level with the start (`ua` < 50) the opening is a five-point outline without the zero-width notch. `tools.js`: type Uwinder; `cutWell` drops railing pieces shorter than 150 mm.
- Harness: 21 risers → 5 + 3 + 5 + 3 + 5, 2.25 × 3.25 m, top 3200; plan and 3D looked at; other stair tests unchanged.

## 2026.11.21-z46
- `bim.js` `stairGeom`: dog-leg with `winder` "3" (eleven risers or more) — `na` treads, six wedge treads (three round each inner corner, the gap strip joined to the third), `nb` treads back; returns `runs`, `lenD` (length on plan), `windRail` (three pieces round the outside). `stairOutline` takes `lenD`; the flat rail across the well is left out when `runs` is given. `tools.js` type Dwinder; `ui-bim.js` the turn select also for dog-leg.
- Harness: 21 risers → 8 + 6 + 7, 3.0 × 2.1 m, top 3200, rails 2 × 2.342 + 2 × 2.049 + 4.006 m round the winders; opening and railing as for the plain dog-leg; U, L, spiral and two-floor tests unchanged.

## 2026.11.21-z45
- Head "horse" (horseshoe arch) for doors, windows and openings. The wall is still cut square to the crown over the full width; inside that cut `mesh.js` builds a circle of radius w / 2 running from 30° below its centre on one side to 30° below on the other (rise 0.75 w), fills round it with the wall's own faces, and adds the two piers under the springing; frame, leaf and glazing stand between the piers (`A` / `Bp` moved in to 0.866 × w / 2); the fan-light has bars from the circle's centre. `B.archSp` returns the solid left inside the cut (0.11815 w² + 0.134 w (h − 0.75 w)), so brick, plaster and shutter area follow.
- Harness: door 1.2 × 2.4 → solid 0.41 m², shutter 2.47 m²; door and window looked at in 3D from outside and inside.

## 2026.11.21-z44
- `bim.js` `B.grillOf`: pattern "ring" — uprights at ~140, two rails a band (≤160 mm, 28 % of the height) apart at mid height, a twelve-sided ring in each gap; weight = bars and rails × 1.13 + rings × 0.62 (10 mm round) + flat all round. Drawn through the existing `diag` strips.
- Both the ring and the diamond pattern were looked at in 3D from outside and inside (picture in /updates).

## 2026.11.21-z43
- `views2d.js` `B.viewLines`: for elevations, walls parallel to the view with their own `lookO` / `colO` (outer face towards the viewer; else `lookI` / `colI`) and not hidden at their middle get a tag "Finish: <name>" at 82 % of their height; the note becomes "Outer walls (where not marked)".
- Harness: front wall painted exposed brick → mark only on the front elevation; the other three unchanged.

## 2026.11.21-z42
- `cad/editor.js`: `ed.marks` — a function returning shapes drawn over the plan on every repaint (not part of the drawing, not plotted). `ui-bim.js`: while the 3D Section panel is open, `ed.marks` draws the section box (dashed rectangle with corner ticks); cleared when the panel closes. The height cut (Cut slider) has no mark on plan.

## 2026.11.21-z41
- `ui-bim.js` Tour along the camera path: a height profile every 0.1 m — at each point the tread (of any stair, any level) under it whose top is within 420 mm of the height reached so far sets the new height; the camera eases to it. Works for all stair kinds (polygon treads included) and for going down.
- Harness: path up a dog-leg stair → camera height rises from 1.6 to 4.8 m (3.2 m floor + eye) and stays there.

## 2026.11.21-z40
- Material pictures (`bim.texs`): `rot` (degrees) and `ox` / `oy` (mm). `assets7.js` `B.regTex` fills `B.TEXR`; `view3d.js` `uTxR[5]` turns and shifts the picture coordinates of patterns 20–24; `ui-assets.js` buttons ⟳ (45° steps, 0–135) and ⇄ (half-width shift on / off). The turn applies to every surface painted with that picture.
- Harness: a striped tile on the walls, straight and at 45° — frames differ, no GL error.

## 2026.11.21-z39
- `view3d.js` movers on a path: a time table along the route (every 0.25 m) — speed falls to 42 % within 3.5 m of a corner over 20°, to 25 % within 4 m of the ends of an open route; position by binary search; wheels turn by the distance covered. Harness: 40 m loop with four corners takes 9.7 s instead of 7.2 s; no GL errors.

## 2026.11.21-z38
- `views2d.js`: VIEWSAUTO (aliases AUTOVIEWS, VIEWSLIVE) toggles `bim.autoViews`; `B.autoViewsHook(ed)` (called from the change hook in `ui-bim.js`) waits 1.1 s, and if the newest undo step touches a building element (and nothing is waiting in redo, no transaction is open) runs `B.refreshViews` and folds its step into that one.
- `view3d.js`: `uTm` — water ripples drift with play time.
- `mesh.js` / `bim.js` / `ui-bim.js`: door `casing` (architrave both faces; quantity `door_architrave`, L, CPWD 9.40.1.1); grill pattern "dia" (`grillOf().diag`, flat strips at ±45°, 212 mm apart); ceiling plaster less the soffit of beams whose middle is not over a counted wall.
- `runs.js`: manholes deeper than 2.5 m → `manhole_c152` (19.13.1.1) + `manhole_xd_c152` (19.14.1, beyond 2.3 m); the 120 × 90 group is now 0.9–2.5 m.
- Checked and struck from the list as already there: recliner, floor lamps, rugs, dining tables that bring their chairs (catalogue 9).
- Harness: diamond grill 24 bars 28.2 kg; architrave 10.7 m; plaster 52.510 − 7.077 − 1.097 m²; drain falling 1:20 → depths 0.6 / 1.65 / 2.7 / 3.75 m → 1 + 1 + 2 manholes; walls raised with auto views on → section redrawn, one undo step, undo restores both; water frames differ between two play times, no GL error.

## 2026.11.21-z37
- `bim/tools.js`: `B.followWalls(doc, tx)` in the wrapped commit, before the rooms are refitted — for every wall whose ends changed in the transaction, slabs and roofs of that level (and the floor slab resting on those walls) with two or more corners within half the wall + 90 + overhang + 500 mm of the old wall line have those corners shifted by the wall's movement there (between the two ends); a corner claimed by several walls takes the largest shift once; anything already changed in the same transaction is skipped (so MOVE of everything and the 3D wall move are not doubled).
- Harness: outer wall stretched 1 m → plinth slab and roof slab corners +1 m with the 450 overhang kept, one undo step; partition moved → slabs unchanged; all moved together → no double shift; 3D wall move → slabs moved once.

## 2026.11.21-z36
- `bim/tools.js`: `B.refitRooms(doc, levels)` — each room is traced again with `CAD.boundaryAt` from a point inside it, against the walls and columns of its own level; skipped when no closed boundary is found, when the area changes more than threefold, or when the new outline swallows another room's inner point. `Doc.prototype.commit` is wrapped: a transaction that touches a wall or column refits the rooms of those levels before it is committed, so it is one undo step (`B.autoRooms = false` turns it off). Command ROOMSFIT (aliases ROOMREFIT, ROOMSUPDATE).
- Harness: partition moved 700 mm → both rooms follow, one undo step, undo restores; partition erased → rooms untouched; outer wall stretched 1 m → the room follows. Stair, floor and 3D-move tests unchanged.

## 2026.11.21-z35
- `bim.js` slab quantities: ceiling plaster = slab area less the plan area of walls whose top lies between 200 mm under the slab soffit and 50 mm over its top and whose centre is under the slab (capped at half the slab). Room with `fl` < −5: `sunk_fill` (V, CPWD 4.1.10 lean concrete — label says to change the item for brick-bat / cinder) and `wp_sunken` (A = floor + perimeter × depth, CPWD 22.5); map entries in `assets4.js`.
- Harness: 8 × 5 m house with one partition → 52.510 − 7.077 m² (hand check: 26 m × 0.23 + 4.77 × 0.23); toilet 15.598 m² sunk 300 → 4.679 m³ and 20.422 m².

## 2026.11.21-z34
- Floor audit (`bim.js` quantities). Found and corrected: skirting ran across doors (now less the widths of doors / floor-level openings whose centre lies within half the wall thickness + 80 mm of the room outline); flooring and PCC ignored holes in the room's floor slab (now less the holes whose centre is inside the room); slab shuttering left out the sides of holes; the raised-floor brick edge was the whole perimeter (now only the door widths).
- Not changed, noted: ceiling plaster is the whole soffit including over walls; a sunk floor (negative `fl`) has no filling item; rooms do not follow walls moved on the plan; false ceiling is not reduced for openings.
- Harness: room 4.27 × 4.77 with one 1 m door → skirting (18.08 − 1.00) × 0.1; upper room 15.598 − 7.350 m² after the stair opening; roof slab shuttering + 11.2 m of opening sides.

## 2026.11.21-z33
- Spiral: the last tread spans max(tread angle, 60°) as the top platform (`flat`, not railed with the flight; the opening's railing leaves the same 60° open). `mat` "steel" (default for new spirals): quantity `ms_stair` (kg = tread area × 6 mm × 7850 × 1.3 + post height × 19.5 kg/m → CPWD 10.25.2, map entry in `assets4.js`), treads drawn 12 mm thick in black steel; otherwise RCC as before.
- Winders checked on the plan view (three wedge treads at the turn); picture in /updates.

## 2026.11.21-z32
- `bim.js` `stairGeom`: L stair with `winder` "3" (seven risers or more) — `na` straight treads, three wedge treads round the inner corner (rays at 30° and 60°), `nb` treads on the second flight; returns `runs` (the straight flights, for the rails), `windRail` (outer rail over the winders, used for "out" / "both"), `L0`, `wdL`. `B.spiralTurn(e)`: height from a tread to the one a turn above (null when the spiral is a turn or less).
- `tools.js`: type Lwinder; spiral warning with the angle that gives 2000 mm. `ui-bim.js`: "The turn is made on", "Height between turns".
- Harness: Lwinder in the 3.27 m room — 3.25 × 3.25 m, 21 treads to 3200, fits where the landing version did not; spiral at 30° warns 1769 mm and suggests 25°. Earlier stair tests unchanged.

## 2026.11.21-z31
- `bim.js` `stairGeom`: kind "ushape" (risers split about a third each, the third flight never longer than the first; returns `U`, `U0`, `W2`, `ua`), kind "spiral" (`e.p` is the corner of its square; centre post r 75, outer radius w + 75, tread angle `sa` 15–45°, turning to the stair's side; steps carry `poly`, `c`, `thin`; returns `S`, `c`, `Ro`, `thEnd`, `post`). All kinds return `landEdges` (outer edges of landings with their height).
- `stairOutline`: `hole` and `ek` (per edge: clearance key, true, or null = where you step off) for L, U and spiral, `inP` (a point inside the opening). `cutWell` builds the railing chains from `hole` / `ek`.
- `stairRails`: a flight ends at a landing whenever its last step is one; spiral = one piece per tread on the outer edge; "out" / "both" add the landing edges. `stairHead` uses the tread centre. Spiral quantities: treads 60 mm + post as RCC stair, tread finish, railing.
- `mesh.js`: polygon treads and the centre post.
- Harness: U (8 + 7 + 6 risers, 2.75 × 3.5 m), spiral (2.15 m square, 21 treads), L with railing on both sides — all reach 3200, openings of 6 / 24 / 6 points, railings round each; dog-leg and L tests of -z29 / -z30 unchanged.

## 2026.11.21-z30
- `bim.js` `stairGeom`: kind "lshape" — flight 1 along the going, last step a w × w landing (`lw`), flight 2 along the side normal with its width along the going; returns `L: true`. Steps now carry `lw` (landing width) instead of the mesh guessing it. `stairOutline`: bounding rectangle plus `hole` (six points) and `L0`; landing volume w × w × waist.
- `mesh.js`: step polygons made counter-clockwise whatever the flight direction. `tools.js`: type Lshape; `cutWell` cuts the L-shaped hole and rails its inner edges; the "already cut" test uses the landing centre.
- Harness: L stair in the corner of a 4.27 × 4.77 m room (3.5 × 3.5 m), hole of six points, two railing runs, handrails 2 × 2.928 m; in the 3.27 m room it says it does not fit. The dog-leg test of -z29 still passes.

## 2026.11.21-z29
- `tools.js`: `cutWell(ed, e)` (shared by STAIR and STAIRWELL) cuts the hole and adds `railing` elements (`well` = stair id, h 1000) on the level whose elevation is the stair top: all sides of the opening except the arrival edge (dog-leg: the part of the start edge over the second flight; straight: the far end) and sides with a wall within 200 mm; re-running replaces them. New STAIRUP (aliases STAIRFLOORS, STAIRREPEAT): copies the stair to each higher level that has walls and no stair at that point, with `n` / `R` from that level's height, and cuts each opening.
- `bim.js` `stairRails`: the first flight of a dog-leg ends at the landing; a flat rail joins the flights across the well. `ui-bim.js`: Landing length, Gap between the flights.
- Harness: two floors — stair with 300 mm gap, railing of five points on L1, STAIRUP adds the L1 stair, both slabs cut, railing on L2.

## 2026.11.21-z28
- `bim.js`: `B.stairRails(e)` (per flight and railed edge: plan ends, tread heights, slope length; `rail` = "in" well side / "out" / "both" / ""), `B.stairHead(doc, e)` (least clear height over treads under the solid part of the slab at the stair top; `low` = treads under 2100). Quantity row `railing` (L, on the slope).
- `mesh.js`: sloping 44 mm handrail (double-sided quads) and 36 mm posts about every third tread, `railH` (900).
- `tools.js` STAIR: option Railing (Well / Outer / Both / None; new stairs default to Well); headroom warning after placing. `ui-bim.js`: Properties → Railing, Railing height, Headroom.
- Harness: dog-leg in a corner → rails 3.221 + 2.928 m; 15 treads low before the opening is cut, none after.

## 2026.11.21-z27
- Stairs. Before: the flights always lay to the left of the going, nothing told the distance to walls, a stair could cross a wall without a word, and the slab above was not cut.
- `bim.js`: stair `side` (1 / -1) in `stairGeom`; `B.stairOutline(e)` (rectangle, len, wd); `B.stairClear(doc, e)` (ray from the middle of each side to the wall faces of the level; `hit` = walls it overlaps, by edge crossing or containment); mirror flips `side`.
- `tools.js` STAIR: options Corner (room boundary at the click → nearest corner → along the edge where len × wd + gap fits, longer edge first), Side, Gap; reports size and the four clear distances, warns on `hit`; asks to add the outline as a hole to slabs whose top is at the level top and which contain it. New STAIRWELL (aliases STAIROPENING, STAIRCUT) for later.
- `mesh.js`: step polygons reversed for side -1. `ui-bim.js`: Properties → Flights lie, Covers on plan, Clear to walls.
- Harness: Corner in a 3.27 × 4.77 m room → stair at the corner, 0 mm to two walls; roof slab 45.16 m² after the 3.5 × 2.1 opening; a stair across the partition gives the warning.

## 2026.11.21-z26
- `bim.js`: `B.grillOf(o)` — window `grill` ("v" upright bars at ~110, "h" level bars at ~120 with uprights at ~600, "sq" 150 grid, "box" 300 × 150); kind "grill" defaults to "v". Weight = bar length × 1.13 kg/m (12 mm square) + perimeter × 0.98 kg/m (25 × 5 flat). Quantity row `ms_grill` (CPWD 9.48.1, kg). This row is new for existing windows of kind "grill" too.
- `mesh.js`: bars drawn from `B.grillOf`, 55 mm off the glass on the opening side (in the glass plane for kind "grill"). `ui-bim.js`: Properties → Safety grill.

## 2026.11.21-z25
- `ui-bim.js` `wallFaces`: the four sides of the plan bounding box of other assets, 3D models and columns on the level (standing square, 150 mm to 6 m, at most 60 pieces, cut-outs left out) are added as snap faces (`obj`); the message says which kind it met. Harness: a sofa dropped 60 mm from another closes to 0.

## 2026.11.21-z24
- `ui-bim.js`: `wallFaces` now keeps every wall face (start, unit vector, normal, length) and the plan points of the moved object; `snapMv` projects the points on each face normal and closes a gap of up to 90 mm, then once more on a face not parallel to the first (corner). Works at any wall angle.
- `runs.js` mesh: a drain with manholes draws the top slab (chamber + 230 mm, 80 below to 60 above the level) and a dark cover at each `B.manholes` point.
- Harness: sofa dropped 50 / 60 mm off a corner ends exactly on both faces; a sofa turned 45° beside a 45° wall closes a 61 mm gap to 0; render without GL errors.

## 2026.11.21-z23
- `mesh.js`: door `open` (degrees, 0–110) — the leaf is swung about its hinge (`swing`) to the side it opens (`flip`); double doors swing both leaves; sliding doors and shutters ignore it. `ui-bim.js`: Properties → "Shown in 3D" (Shut / Half open / Open); `wallMask` leaves a gap for doors with `open` ≥ 30, so fittings light through them at night.
- `site.js`: STEPS option Door — finds the rooms on the two sides of the picked door (point 350 mm beyond each wall face), takes their `fl`, and places a `steps` element on the lower side with rise = the difference, width = the door, top step against the wall. No room on a side counts as floor level 0.
- Harness: door open 90° with a room raised 450 mm → 3 risers of 150; day and night renders without GL errors.

## 2026.11.21-z22
- `runs.js`: `B.manholes(doc, e)` — for a drain run with a spacing: both ends, bends over 10° (not closer than 2 m to the last one), points where another drain run ends on it, and evenly in between so that no gap exceeds the spacing. An end that runs into another drain with manholes is left to that drain; two ends meeting are counted by the lower id. Depth at each = start depth + chainage / fall. Quantities: `manhole` (CPWD 19.7.1.1, up to 0.9 m), `manhole_120` (19.7.2.1), `manhole_xd_90` (19.8.1.1, depth beyond 0.45 m), `manhole_xd_120` (19.8.2.1, beyond 0.9 m); a note when the deepest is over 2.5 m. Plan: chamber outline and cover circle.
- `site.js`: DRIVEPATH (aliases VEHICLEPATH, DRIVEROUTE) — polyline on layer A-DRIVEPATH with `drv` (asset id) and `spd` (km/h). `mesh.js`: such an asset becomes a mover with `path / cum / len / loop / spd / rot`. `view3d.js`: `uFlip` is now vec4 (on, centre, angle) — a rotation about the vehicle's centre in both the main and the shadow vertex shaders; heading from the chord 1.2 m behind to 1.2 m ahead. Open path: there and back; closed: round and round.
- `ui-bim.js`: `wallFaces` / `snapMv` — in 3D Move an asset, model, run or column snaps its plan bounding box to axis-parallel wall faces within 90 mm (walls at an angle are not snapped). Colour input `data-v3secc` beside Cut → `v3.secCol` → `uSecCol` (kept in localStorage `ep_seccol`).
- Tested in the harness: manhole list and rows on an L-shaped drain with a branch; car on a closed path at three times (no GL errors, both programs link); sofa snapped to the inner face of a wall; cut colour.

## 2026.11.21-z21
- New `server/shared.sql` (not published; owner to run): `shared_lib` (kind block / pat / material; read by all signed-in users, written through `shared_put` / `shared_del` by admins) and `ep_switches` (`admin_set_switch`, super admin only). Tested on PostgreSQL 16 with stand-in auth tables.
- New `js/ui-shared.js`: BLOCKSHARE, HATCHSHARE; BLOCKLIB shows shared blocks beside the device's; shared patterns are registered when a drawing opens; Users tab → Modules panel (wraps `U.adminTop`); switched-off tabs are hidden for non-owners (elements with `data-tab` / `data-nav` / `data-go`) and `S.tab` is sent back to the last allowed tab. Does nothing until the SQL is run. **Not checked against the real navigation markup** (ui-core.js cannot be read in the build session) — confirm with the owner that a switched-off module really disappears.

## 2026.11.21-z20
- `assets2.js`: part type `w` (`B.AH.wheel`): tyre + rim with spoke sectors, axle across the vehicle; vertices carry pattern 18 and their offsets from the axle in the size / gloss slots. `view3d.js`: `uWh` turns them in the vertex shader while a mover drives; the fragment shader treats pattern 18 as plain. Cars and the motorcycle use it.
- Walking cut-outs sway (top of the quad shifts ±3.5 % of the height).
- Design Studio `STD_SCALES`: 15, 30, 40, 60 added (the owner asked for the sheets to be finished; the earlier question about these scales is taken as yes).

## 2026.11.21-z19
- Lamp shadow: at night the fitting nearest the camera target renders a 1024 px depth map looking straight down (fov 2.25 rad, near 0.4 m, far 14 m; opaque geometry only) — `lsFB` / unit 11, `lampSh` in the main shader darkens that light's share to 25 % in shadow. `lampShadow = false` or 💡 Fast lights switches it off.
- Wall mask: 3 × 3 tiles (nine storeys), windows are gaps as well as openings.
- `reflAll` (✨ Reflections): `uRf.x = 2` → glass and gloss > 0.45 use the same screen-space reflection as water.

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
