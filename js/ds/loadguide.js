/* Design Studio — Load guide (simplified reference data, ES5).
   Plain-language load values for general civil sites and SECL coal-mine sites (Korba/Gevra/Dipka/Kusmunda).
   Source notes: "[CODE]" = mandatory code value; "[GP]" = good practice; "[ASSUMPTION]" = not verified online,
   conservative engineering value — verify before issue.  Full justification: test/ds/site_research.md
   Item shape: {name, value, unit, apply, impact, note, source} ; value may be a number, range string or text. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};

  function it(name, value, unit, apply, impact, note, source) {
    return { name: name, value: value, unit: unit, apply: apply || "", impact: impact || "", note: note || "", source: source || "" };
  }

  var g = 9.81;

  DS.loadguide = {
    version: "2026-10-07",
    g: g,
    legend: {
      CODE: "Mandatory by code",
      GP: "Good practice / engineering judgement",
      ASSUMPTION: "Not verified online – conservative value, verify before issue"
    },

    categories: [
      /* ---------------------------------------------------------------- (a) unit weights */
      { id: "unit_weights", title: "Unit weights of materials (IS 875 Part 1)", hi: "सामग्री का इकाई भार", site: "both",
        items: [
          it("Reinforced cement concrete (RCC)", 25, "kN/m³", "Self-weight = 25 × thickness (m) → kN/m²", "", "Slab 150 mm = 3.75 kN/m²", "IS 456:2000 cl 19.2.1 [CODE]"),
          it("Plain cement concrete (PCC)", 24, "kN/m³", "Self-weight", "", "", "IS 456:2000 cl 19.2.1 [CODE]"),
          it("Brick masonry (burnt clay)", "19–20", "kN/m³", "Wall load = γ × t × h (kN/m)", "", "230 mm wall, 3 m high ≈ 13.8 kN/m (γ=20)", "IS 875-1 Table 1 (18.85 kN/m³ common brick) – use 20 incl. plaster [GP]"),
          it("Fly-ash brick / solid concrete block", "18–21", "kN/m³", "Wall load", "", "", "IS 875-1 / manufacturer [ASSUMPTION]"),
          it("AAC block masonry", "6–8", "kN/m³", "Wall load", "", "Light partition", "IS 2185-3 / manufacturer [ASSUMPTION]"),
          it("Stone masonry (rubble / granite)", "21–26.5", "kN/m³", "Wall/retaining wall self-weight", "", "Use 22 for random rubble", "IS 875-1 Table 1"),
          it("Structural steel", 78.5, "kN/m³", "Member self-weight = 78.5 × A", "", "7850 kg/m³", "IS 800:2007 cl 2.2.4 / IS 875-1"),
          it("Water", "9.81 (use 10)", "kN/m³", "Hydrostatic pressure = γw × depth", "", "Mine water with silt: 10.5–11 [GP]", "IS 875-1; IS 3370"),
          it("Soil / earth fill (moist)", "16–20", "kN/m³", "Earth pressure, fill on slabs/footings", "", "Use 18 general, 20 for compacted / saturated", "IS 875-1 Table 1"),
          it("Overburden (OB) broken rock / dump material", "18–22", "kN/m³", "Fill on culverts, dump surcharge", "", "Loose dump ≈ 18, compacted/saturated ≈ 22", "Mine practice [ASSUMPTION]"),
          it("Coal (bulk, run-of-mine / crushed)", "8–9", "kN/m³", "Bunker/silo/stockpile/conveyor load", "", "0.8–0.9 t/m³; angle of repose 35–38°", "IS 875-1 Table 1 (coal ≈ 7.85–8.8) / IS 9178 [GP]"),
          it("Coal dust (deposit on roofs)", "5–7", "kN/m³", "Roof DL allowance", "", "", "[ASSUMPTION]"),
          it("Sand (dry / wet)", "16 / 19", "kN/m³", "Fill, bedding", "", "", "IS 875-1 Table 1"),
          it("Coarse aggregate (bulk)", "15–17", "kN/m³", "Stockpile, bins", "", "", "IS 875-1 Table 1"),
          it("Cement (bulk)", 14.1, "kN/m³", "Store floors / silos", "", "1 bag (50 kg) ≈ 0.49 kN", "IS 875-1 Table 1"),
          it("Fly ash (dry, loose)", "9–12", "kN/m³", "Ash pond bunds, fill", "", "", "[ASSUMPTION]"),
          it("Timber (sal / teak)", "6.5–8.8", "kN/m³", "Formwork, roof members", "", "", "IS 875-1 Table 1"),
          it("Ballast (railway)", 17.6, "kN/m³", "Track dead load", "", "Track + ballast + sleepers BG ≈ 25–30 kN/m per track", "Bridge Rules [ASSUMPTION]"),
          it("Floor finish 50 mm screed + tiles", "1.0–1.5", "kN/m²", "UDL on slab (finish)", "", "Use 1.0 residential, 1.5 industrial", "IS 875-1 derived [GP]"),
          it("Terrazzo / IPS 25–40 mm", "0.6–1.0", "kN/m²", "UDL on slab", "", "", "IS 875-1 derived"),
          it("Plaster 12–15 mm (one face)", 0.25, "kN/m²", "Add to wall/slab soffit", "", "", "IS 875-1 derived"),
          it("Roof waterproofing + brickbat coba (avg 100 mm)", "1.5–2.0", "kN/m²", "Roof DL", "", "", "[GP]"),
          it("Partition (movable / unknown layout)", "1/3 of wall weight per m run, min 1.0", "kN/m²", "Add as UDL on floor", "", "Wall > 4 kN/m run: design as line load", "IS 875-2 cl 3.1.2 [CODE]"),
          it("GI / colour-coated sheet roofing incl. laps", "0.10–0.15", "kN/m²", "Roof DL (sheet_dl)", "", "Add purlins 0.1 & services", "IS 875-1 / manufacturer"),
          it("AC sheet roofing", "0.17–0.20", "kN/m²", "Roof DL", "", "", "IS 875-1"),
          it("Services / ceiling / lights", "0.25–0.5", "kN/m²", "Hung load", "", "Industrial with ducts 0.5–1.0", "[GP]")
        ] },

      /* ---------------------------------------------------------------- (b) imposed loads */
      { id: "imposed", title: "Imposed (live) loads (IS 875 Part 2:1987 Table 1/2)", hi: "अधिरोपित (जीवित) भार", site: "both",
        items: [
          it("Residential – rooms, kitchen, toilet", 2.0, "kN/m²", "UDL on floor", "", "", "IS 875-2 Table 1 [CODE]"),
          it("Residential – stairs, corridors, balconies", 3.0, "kN/m²", "UDL; balcony edge also 1.5 kN/m line", "", "", "IS 875-2 Table 1 [CODE]"),
          it("Office – with separate storage", 2.5, "kN/m²", "UDL", "", "", "IS 875-2 Table 1 [CODE]"),
          it("Office – without separate storage / corridors, stairs", 4.0, "kN/m²", "UDL", "", "", "IS 875-2 Table 1 [CODE]"),
          it("Assembly – fixed seats / without fixed seats", "4.0 / 5.0", "kN/m²", "UDL", "", "Canteen, rest shelter without fixed seats = 5.0", "IS 875-2 Table 1 [CODE]"),
          it("Educational classrooms / hospital wards", "3.0 / 2.0", "kN/m²", "UDL", "", "", "IS 875-2 Table 1 [CODE]"),
          it("Stores – general (light)", "2.4 per m storage height, min 7.5", "kN/m²", "UDL", "", "Spare-parts store 2.5 m high ≈ 7.5", "IS 875-2 Table 1 [CODE]"),
          it("Stores – heavy (cement, steel, coal bags)", "≥ 10 (compute actual: γ × stack height)", "kN/m²", "UDL", "", "Cement stack 2 m: 14.1×2 ≈ 28 kN/m²", "IS 875-2 Table 1 + actual [GP]"),
          it("Workshop – light / medium / heavy", "5.0 / 7.0 / 10.0", "kN/m²", "UDL + machine point loads", "See machinery impact", "Mine HEMM workshop = heavy (10) + vehicle wheel loads", "IS 875-2 Table 1 [CODE]"),
          it("Garage – light vehicles (≤ 2.5 t) / heavy vehicles", "2.5 / 5.0 + wheel loads", "kN/m²", "UDL; check wheel point load", "", "Dumper / HEMM bays: design for actual wheel loads", "IS 875-2 Table 1 [CODE]"),
          it("Flat roof – access provided", 1.5, "kN/m²", "UDL", "", "", "IS 875-2 Table 2 [CODE]"),
          it("Roof – no access (slope ≤ 10°)", 0.75, "kN/m²", "UDL on plan", "", "", "IS 875-2 Table 2 [CODE]"),
          it("Sloping roof – no access (slope > 10°)", "0.75 − 0.02 × (θ − 10), min 0.40", "kN/m²", "UDL on plan area", "", "θ = 20° → 0.55; θ ≥ 27.5° → 0.40", "IS 875-2 Table 2 [CODE]"),
          it("Roof purlin/sheeting concentrated load", 0.9, "kN", "Point load at worst position (no access)", "", "Not simultaneous with UDL", "IS 875-2 Table 2 [CODE]"),
          it("Parapet / balcony railing horizontal", "0.75 (res.) / 1.5 (public)", "kN/m", "Line load at top of railing", "", "", "IS 875-2 cl 3.2 [CODE]"),
          it("Impact – lifts, hoists frames", 100, "% of load", "Multiply static load", "", "", "IS 875-2 cl 6.1 [CODE] (verify)"),
          it("Impact – light machinery (shaft/motor driven)", 20, "%", "Add to machine weight", "", "Pumps, fans, small motors", "IS 875-2 cl 6.1 [CODE]"),
          it("Impact – reciprocating machinery / power units", 50, "%", "Add to machine weight", "", "Compressors, DG sets (or do dynamic analysis)", "IS 875-2 cl 6.1 [CODE]"),
          it("Impact – hangers supporting floors/galleries", 33.3, "%", "Add", "", "", "IS 875-2 cl 6.1 [CODE]"),
          it("Crane – vertical impact, EOT (electric)", 25, "% of max static wheel load", "Gantry girder design", "", "Hand-operated crane: 10%", "IS 875-2 cl 6.3 [CODE] (verify)"),
          it("Crane – horizontal surge (transverse)", "10% (EOT) / 5% (hand) of (crab + lifted load)", "", "Equally to both rails at rail level", "", "", "IS 875-2 cl 6.3 [CODE]"),
          it("Crane – longitudinal (drag/braking)", 5, "% of static wheel loads", "Along rail, at rail level", "", "", "IS 875-2 cl 6.3 [CODE]")
        ] },

      /* ---------------------------------------------------------------- (c) mine & industrial equipment */
      { id: "dumpers", title: "Rear-dump trucks (dumpers) used in coal mines", hi: "डम्पर (खदान वाहन)", site: "mine",
        items: [
          it("BEML BH35-2 (35 t class)", "GVW 59.6 t; empty 27.8 t; loaded F/R 33/67% → rear axle 391 kN", "t / kN", "Axle loads; 4 rear wheels (dual) ≈ 98 kN each; tyre 18.00-25", "IM 30% → 10% with fill (see culvert)", "", "BEML BH35-2 data sheet"),
          it("BEML BH60M (60 t class, rock body)", "GVW 98 t; empty 43.5 t; loaded F/R 33.0/65.0 t → rear 637 kN", "t / kN", "Axle loads; tyre 24×35", "30%", "Coal body GVW 89.5 t", "BEML BH60M data sheet"),
          it("Komatsu HD465-7 (55 t)", "GVW ≈ 99.7 t; payload 55.3 t; rear ≈ 655 kN", "t / kN", "Axle loads; tyre 24.00R35; wheelbase 4.3 m", "30%", "", "Ritchie specs HD465-7"),
          it("BEML BH100 (100 t class)", "GVW 165 t; empty 74 t; loaded F/R 54.45/111.05 t → rear 1089 kN", "t / kN", "Axle loads; tyre 27.00×49; wheel ≈ 272 kN", "30%", "", "BEML BH100 data sheet"),
          it("Komatsu HD785-7 (100 t)", "GVW 163.8 t; payload 91.7 t; rear ≈ 1076 kN", "t / kN", "Tyre 27.00R49", "30%", "", "Komatsu HD785-7 spec"),
          it("Cat 777 (100 t)", "GVW ≈ 164 t; rear ≈ 1060 kN", "t / kN", "Tyre 27.00R49", "30%", "", "[ASSUMPTION] typical published"),
          it("BEML BH150E (150 t)", "GVW 240 t; loaded F/R 79.2/160.8 t → rear 1577 kN", "t / kN", "Tyre 33.00R51", "30%", "", "BEML BH150E data sheet"),
          it("Cat 785 (150 t)", "GVW 255.8 t; F/R 33/67 → rear 1681 kN", "t / kN", "Tyre 33.00R51/36.00R51; wheelbase 5.18 m; rear dual c/c 4.285 m", "30%", "", "cat.com/785"),
          it("BelAZ 75131 (130 t)", "GVW ≈ 225–230 t; rear ≈ 1480 kN", "t / kN", "Tyre 33.00R51", "30%", "Check if in fleet", "[ASSUMPTION]"),
          it("Cat 789 (190 t)", "GVW ≈ 318 t; rear ≈ 2090 kN", "t / kN", "Tyre 37.00R57", "30%", "", "[ASSUMPTION] typical published"),
          it("Cat 793F (240 t)", "GVW 386 t; F/R 33/67 → rear 2537 kN", "t / kN", "Tyre 40.00R57; wheel ≈ 634 kN", "30%", "", "cat.com 793F"),
          it("Tyre contact pressure (all dumpers)", "600–700 (use 650)", "kPa", "Contact area = wheel load / pressure", "", "Contact width ≈ tyre section width", "[ASSUMPTION]"),
          it("Tipper 10–25 t payload (on-highway)", "GVW 16–49 t; axle ≤ 10.2 t (single) / 19 t (tandem) per CMVR", "t", "IRC Class A covers; use 70R for multi-axle 49 t", "IRC impact", "Overloaded coal tippers common – use 70R", "CMVR / IRC:6 [GP]"),
          it("Comparison: IRC 70R max axle", "20 t (196 kN); bogie 40 t", "t", "", "", "BH100 rear axle = 5.5× ; Cat 793F = 13× → IRC 70R NOT sufficient for haul roads", "IRC:6 cl 204.1")
        ] },

      { id: "hemm", title: "Other HEMM (excavators, dozers, graders, sprinklers, drills, trailers)", hi: "भारी खनन मशीनें", site: "mine",
        items: [
          it("Hydraulic excavator PC210 / PC300 / PC450", "≈ 21 / 31 / 44 t operating", "t", "Track pressure = W/(2 × track length × shoe width) ≈ 45–80 kPa", "25% (digging/slewing)", "Slewing creates eccentric track load: take 75% of W on one track [GP]", "[ASSUMPTION] manufacturer typical"),
          it("Large hydraulic excavator PC2000 / EX1200", "≈ 200 / 110 t", "t", "Track pressure ≈ 150–200 kPa", "25%", "", "[ASSUMPTION]"),
          it("Electric rope shovel (10–20 m³)", "≈ 500–1100 t", "t", "Crawler ≈ 200–300 kPa", "25%", "Only on prepared benches – do not cross culverts", "[ASSUMPTION]"),
          it("Dozer D8 / D9 / D11", "≈ 38 / 49 / 104 t", "t", "Tracked: W over 2 tracks (D11 track ≈ 4.4 m × 0.71 m) ≈ 165 kPa", "25% (IRC tracked)", "", "[ASSUMPTION] Cat typical"),
          it("Motor grader (16M / 24M)", "≈ 31 / 62 t", "t", "Rear tandem ≈ 70% of W", "30%", "", "[ASSUMPTION]"),
          it("Water sprinkler 28 kL (on 50–60 t dumper chassis)", "Loaded GVW ≈ 70–75 t", "t", "Rear axle ≈ 67%", "30% (sloshing)", "", "[ASSUMPTION]"),
          it("Water sprinkler 70 kL (on 100 t chassis)", "Loaded GVW ≈ 145–150 t", "t", "Rear axle ≈ 67%", "30%", "", "[ASSUMPTION]"),
          it("Blast-hole drill (160–250 mm, crawler)", "≈ 35–60 t", "t", "Track + jack pads (pad ≈ 25% W each)", "", "", "[ASSUMPTION]"),
          it("Low-bed trailer (HEMM transport 60–100 t)", "GVW ≈ 100–150 t over 6–8 axle lines", "t", "≈ 15–20 t per axle line; check bridges for 70R and actual", "IRC impact", "Moving a D11/PC2000 on public roads needs bridge check", "[ASSUMPTION]")
        ] },

      { id: "chp", title: "Coal handling (CHP), conveyors, bunkers, silos", hi: "कोयला हैंडलिंग संयंत्र", site: "mine",
        items: [
          it("Coal load on conveyor", "w = Q / (3.6 × v)", "kg/m", "Q in t/h, v in m/s; line load on gallery", "", "1000 t/h at 3.15 m/s → 88 kg/m ≈ 0.86 kN/m (×1.2 for surge)", "Standard [GP]"),
          it("Belt + idlers + stringers (per conveyor)", "0.8–1.5", "kN/m", "Line load on gallery trusses", "", "1000–1400 mm belt", "[ASSUMPTION]"),
          it("Conveyor gallery walkway LL", "3.0–5.0", "kN/m²", "UDL on walkway", "", "Plus coal spillage 1.0 kN/m² in mine [GP]", "IS 11592 practice [ASSUMPTION]"),
          it("Belt tension at drive/tail pulleys", "from conveyor design", "kN", "Horizontal point load at pulley supports", "", "Get from mechanical vendor (IS 11592)", "[GP]"),
          it("Coal stockpile ground pressure", "γ × h = 8.5 × h", "kN/m²", "On ground slabs / reclaim tunnels", "", "8 m pile ≈ 68 kN/m²; dozer on pile adds", "[GP]"),
          it("Bunker / silo wall pressure (Janssen)", "p_h = γR/μ' × (1 − e^(−μ'K z/R))", "kN/m²", "R = A/perimeter, μ' = wall friction 0.4–0.5, K = 0.4–0.5", "Emptying overpressure ×1.5–2.0", "Coal γ 8–9 kN/m³; IS 9178 (Parts 1–3) governs", "IS 9178 [CODE]"),
          it("Crusher / feeder breaker floor", "machine weight × 1.5–2.0", "kN", "Point loads at machine supports", "50% (reciprocating) or dynamic analysis", "", "IS 875-2 cl 6.1 / IS 2974"),
          it("Wagon loading silo / rapid loading", "per IS 9178 + railway loading below", "", "", "", "Railway structure – railway approval", "[GP]")
        ] },

      { id: "electrical", title: "Transformers, DG sets, pumps, workshop machinery", hi: "विद्युत / यांत्रिक उपकरण", site: "both",
        items: [
          it("Transformer 1 MVA (11/0.433 kV)", "≈ 3.5–4.5", "t", "Plinth: 4 wheel/skid points; + oil 0.9 t/m³", "", "Use nameplate weight", "[ASSUMPTION]"),
          it("Transformer 5 MVA / 10 MVA (33/11 kV)", "≈ 15 / 25–30", "t", "Plinth + rail; oil soak pit for > 2000 L", "", "Use nameplate weight", "[ASSUMPTION]"),
          it("DG set 125 / 500 / 1000 kVA", "≈ 2.5 / 6–7 / 11–13", "t", "Block foundation ≥ 2–3 × machine mass", "Reciprocating: 50% or dynamic (IS 2974-4)", "Isolate from floor", "IS 2974 [GP]"),
          it("Pump (de-watering) 100–300 HP", "≈ 2–5", "t", "Point loads + 20% impact", "20%", "Pump house is critical: I = 1.5", "IS 875-2 cl 6.1"),
          it("Workshop machinery (lathe, press, compressor)", "1–15", "t", "Point loads; floor 10 kN/m² heavy workshop", "20–50%", "", "IS 875-2"),
          it("EOT crane 5 t (span 12–18 m)", "max wheel ≈ 45–55", "kN", "2 wheels/end carriage; gantry design", "+25% vertical, 10% surge", "Get crane data sheet (IS 3177)", "[ASSUMPTION]"),
          it("EOT crane 10 t", "max wheel ≈ 75–90", "kN", "", "+25%", "", "[ASSUMPTION]"),
          it("EOT crane 20 t", "max wheel ≈ 130–150", "kN", "", "+25%", "", "[ASSUMPTION]"),
          it("EOT crane 30 t", "max wheel ≈ 190–220", "kN", "", "+25%", "HEMM workshops often 30–50 t", "[ASSUMPTION]")
        ] },

      { id: "railway", title: "Railway loading (culverts / structures under track – railway rules, separate from mines)", hi: "रेलवे भार", site: "railway",
        items: [
          it("25t Loading-2008 – max axle", 25, "t (245 kN)", "Axle group on bogie (spacing ≈ 1.85–2.0 m); EUDL from Bridge Rules tables", "CDA = 0.15 + 8/(6+L) (concrete), reduced with fill", "Trailing ≈ 12.13 t/m (verify)", "IRS Bridge Rules [CODE]"),
          it("DFC loading – max axle", 32.5, "t (319 kN)", "As above", "As above", "Trailing ≈ 15 t/m (verify)", "IRS Bridge Rules [CODE]"),
          it("CDA reduction with cushion d", "d<0.9: ×(2−d/0.9)/2; 0.9: ½ (≤0.5); then linear to 0 at d = 3.9 m", "", "", "", "d incl. ballast", "Bridge Rules cl 2.4.2 [CODE]"),
          it("Dispersion under sleeper", "2.75 m sleeper; 1H:2V through ballast & fill", "", "Width at depth h = 2.75 + h", "", "", "Bridge Rules cl 2.3.4.2 [ASSUMPTION – verify]"),
          it("Live-load surcharge on walls (per track)", "≈ 60 (25t) / 75 (DFC)", "kN/m²", "Over ≈ 3.1 m width at formation", "included", "Static ≈ 42 / 54", "Derived – site_research.md §1.1 [ASSUMPTION]")
        ] },

      { id: "road", title: "Road vehicles (IRC:6)", hi: "सड़क वाहन (IRC)", site: "both",
        items: [
          it("IRC Class A train", "Axles 2.7, 2.7, 11.4, 11.4, 6.8×4 t", "t", "Spacings 1.1, 3.2, 1.2, 4.3, 3, 3, 3 m; wheel gauge 1.8 m", "RCC: 4.5/(6+L)", "Normal design for all roads", "IRC:6 cl 204.1, 208.2 [CODE]"),
          it("IRC Class 70R wheeled", "100 t; max axle 20 t; bogie 2×20 t @ 1.22 m", "t", "Contact 0.41 × 0.61 m per wheel set", "25% for short spans", "", "IRC:6 cl 204.1 [CODE]"),
          it("IRC Class 70R tracked", "70 t on 2 tracks 4.57 × 0.84 m @ 2.06 m c/c", "t", "", "25% (L≤5 m) → 10% at 9 m", "", "IRC:6 cl 204.1, 208.3 [CODE]"),
          it("IRC Class AA tracked / wheeled", "70 t tracked (3.6 × 0.85 m); 40 t wheeled (2 × 20 t @ 1.2 m)", "t", "", "as 70R", "", "IRC:6 [CODE]"),
          it("Impact with fill ≥ 0.6 m", "½ of normal impact", "", "", "", "Taper to 0 at 2.4 m fill (AASHTO) [GP]", "IRC:6 cl 208.6 (as read)"),
          it("Dispersion through fill", "45° (1:1) both ways", "", "(b+2z) × (l+2z), merge overlapping wheels", "", "Use 2V:1H for loose fill [GP]", "IRC:6 cl 204.2"),
          it("Live-load surcharge on walls", "1.2 m earth ≈ 24", "kN/m²", "Uniform surcharge; lateral K × q", "", "", "IRC:6 cl 214.1 [CODE]"),
          it("Braking", "20% first train + 10% succeeding", "", "At road level", "", "", "IRC:6 cl 211.2 [CODE]")
        ] },

      /* ---------------------------------------------------------------- (d) surcharge */
      { id: "surcharge", title: "Surcharge for retaining walls & drains", hi: "दीवार/नाली पर अतिरिक्त भार (सरचार्ज)", site: "both",
        items: [
          it("General (footpath, light traffic, construction)", 10, "kN/m²", "Uniform surcharge; lateral = Ka × q", "", "", "General practice [GP]"),
          it("Road traffic (IRC)", 24, "kN/m²", "1.2 m earth equivalent", "", "", "IRC:6 cl 214.1 [CODE]"),
          it("Mine road (LMV, tippers)", 20, "kN/m²", "Minimum next to any mine road", "", "", "[GP]"),
          it("Haul road – 35–60 t dumpers", "≈ 60–80", "kN/m²", "Rear-axle dispersed at 0.5–0.6 m depth", "+30%", "Keep bund so wheel ≥ 1.5 m from wall", "Computed (site_research.md §1.3) [ASSUMPTION]"),
          it("Haul road – 100 t class", "≈ 110", "kN/m²", "", "+30%", "", "Computed [ASSUMPTION]"),
          it("Haul road – 150–240 t class", "≈ 140–170", "kN/m²", "", "+30%", "", "Computed [ASSUMPTION]"),
          it("Equivalent surcharge method", "q = P_axle / ((T + b + 2·z)(l + 2·z)) at z = 0.5 m", "kN/m²", "T = rear track (dual-pair c/c), b tyre width, l contact length = P_wheel/(650 kPa × b)", "", "Or Boussinesq strip load if wheel set back", "[GP]"),
          it("Railway track (per track)", "≈ 60 (25t) / 75 (DFC)", "kN/m²", "Over 3.1 m at formation", "included", "", "Derived [ASSUMPTION]"),
          it("Coal / OB stockpile behind wall", "γ × h_pile (sloping surcharge)", "kN/m²", "Use Coulomb with β = repose angle", "", "", "[GP]")
        ] },

      /* ---------------------------------------------------------------- (e) wind & seismic */
      { id: "wind_seismic", title: "Wind (IS 875-3:2015) & seismic zone (IS 1893-1:2016)", hi: "हवा व भूकंप क्षेत्र", site: "both",
        items: [
          it("Raipur", "Vb 39 m/s; Zone II", "", "", "", "", "IS 875-3 Annex A; IS 1893 [CODE]"),
          it("Durg / Bhilai", "Vb 39 m/s; Zone II", "", "", "", "", "IS 875-3 Annex A (Bhilai)"),
          it("Bilaspur", "Vb 39 m/s; Zone II", "", "", "", "Read from map", "[ASSUMPTION]"),
          it("Korba / Gevra / Dipka / Kusmunda", "Vb 39 m/s (conservative 44); Zone II", "", "", "", "Read from map", "[ASSUMPTION]"),
          it("Raigarh", "Vb 39 (cons. 44); Zone II", "", "", "", "", "[ASSUMPTION]"),
          it("Ambikapur", "Vb 39 (cons. 44); Zone III (cons.)", "", "", "", "", "[ASSUMPTION]"),
          it("Jharsuguda", "Vb 39 (cons. 44); Zone III (cons.)", "", "", "", "Rourkela = 39 in Annex A", "[ASSUMPTION]"),
          it("Dhanbad", "Vb 47; Zone III", "", "", "", "Bokaro = 47", "[ASSUMPTION]"),
          it("Singrauli", "Vb 47; Zone III", "", "", "", "", "[ASSUMPTION]"),
          it("Nagpur", "Vb 44; Zone II", "", "", "", "", "IS 875-3 Annex A"),
          it("k1 (risk coefficient)", "1.0 general (50 yr); 1.07 important (100 yr); 0.92 temporary (25 yr)", "", "", "", "", "IS 875-3 Table 1"),
          it("k2 (terrain & height)", "Category 1–2 open mine areas; 3 township", "", "", "", "", "IS 875-3 Table 2"),
          it("k3 (topography)", "1.0 flat; up to 1.36 at OB dump / hill crest", "", "", "", "", "IS 875-3 Annex C"),
          it("k4 (cyclone)", "1.0 inland", "", "", "", "Only within 60 km of coast", "IS 875-3 cl 6.3.4"),
          it("Seismic Z", "II 0.10, III 0.16, IV 0.24, V 0.36", "", "", "", "2025 draft map (Zone VI) revoked by BIS Mar 2026 – IS 1893:2016 governs", "IS 1893-1:2016 Table 3"),
          it("Importance factor I", "1.5 critical/lifeline; 1.2 > 200 occupants; 1.0 others", "", "", "", "", "IS 1893-1:2016 Table 8")
        ] }
    ],

    /* Wind & seismic lookup for UI */
    cities: {
      "Raipur": { Vb: 39, zone: "II", verified: true },
      "Durg": { Vb: 39, zone: "II", verified: true },
      "Bhilai": { Vb: 39, zone: "II", verified: true },
      "Bilaspur": { Vb: 39, zone: "II", verified: false, conservative_Vb: 44 },
      "Korba": { Vb: 39, zone: "II", verified: false, conservative_Vb: 44 },
      "Raigarh": { Vb: 39, zone: "II", verified: false, conservative_Vb: 44 },
      "Ambikapur": { Vb: 39, zone: "III", verified: false, conservative_Vb: 44 },
      "Jharsuguda": { Vb: 39, zone: "III", verified: false, conservative_Vb: 44 },
      "Dhanbad": { Vb: 47, zone: "III", verified: false },
      "Singrauli": { Vb: 47, zone: "III", verified: false },
      "Nagpur": { Vb: 44, zone: "II", verified: true }
    },

    /* Dumper presets for culvert / surcharge modules (geometry = ASSUMPTION except Cat 785) */
    dumpers: [
      { id: "bh35", name: "35 t class (BEML BH35-2)", gvw_t: 59.56, front_frac: 0.33, tyre_b: 0.50, dual_cc: 0.60, track_r: 2.60, track_f: 2.70, wheelbase: 4.0 },
      { id: "bh60", name: "60 t class (BH60M / HD465)", gvw_t: 98.0, front_frac: 0.34, tyre_b: 0.65, dual_cc: 0.75, track_r: 3.20, track_f: 3.30, wheelbase: 4.3 },
      { id: "bh100", name: "100 t class (BH100 / HD785 / Cat 777)", gvw_t: 165.0, front_frac: 0.33, tyre_b: 0.69, dual_cc: 0.85, track_r: 3.80, track_f: 4.00, wheelbase: 4.95 },
      { id: "c785", name: "150 t class (Cat 785 / BH150E)", gvw_t: 255.8, front_frac: 0.33, tyre_b: 0.85, dual_cc: 1.05, track_r: 4.285, track_f: 4.40, wheelbase: 5.18 },
      { id: "c789", name: "190 t class (Cat 789)", gvw_t: 317.5, front_frac: 0.33, tyre_b: 0.94, dual_cc: 1.15, track_r: 4.90, track_f: 5.00, wheelbase: 5.70 },
      { id: "c793", name: "240 t class (Cat 793F)", gvw_t: 386.0, front_frac: 0.33, tyre_b: 1.02, dual_cc: 1.25, track_r: 5.20, track_f: 5.40, wheelbase: 5.90 }
    ],
    tyre_pressure_kPa: 650,

    /* Dynamic factor helpers (see site_research.md §1) */
    cda_rail: function (L, d, steel) {
      var c0 = steel ? 8 / (6 + L) : 0.15 + 8 / (6 + L);
      if (c0 > 1) c0 = 1;
      if (d < 0.9) return c0 * (2 - d / 0.9) / 2;
      var c9 = Math.min(c0 / 2, 0.5);
      if (d >= 3.9) return 0;
      return c9 * (1 - (d - 0.9) / 3);
    },
    im_haul: function (z) {           // haul-road dumper impact fraction [GP/ASSUMPTION]
      if (z <= 0.3) return 0.30;
      if (z >= 2.4) return 0.10;
      return 0.30 - 0.20 * (z - 0.3) / 2.1;
    },
    roof_ll_sloped: function (deg) {  // IS 875-2 Table 2, no access
      if (deg <= 10) return 0.75;
      return Math.max(0.4, 0.75 - 0.02 * (deg - 10));
    },

    /* UI hints: Design Studio input key → recommended values */
    params: {
      ll:        { general: { value: 2.0, note: "Residential 2.0, office 2.5–4.0, assembly 4–5, workshop 5/7/10 kN/m² (IS 875-2 Table 1). आवासीय 2.0" },
                   mine:    { value: 5.0, note: "Mine office 2.5–4; stores ≥ 7.5; HEMM workshop 10 + wheel loads; CHP floors 5 + spillage. खदान कार्यशाला 10" } },
      floor_ll:  { general: { value: 2.0, note: "IS 875-2 Table 1 by occupancy" },
                   mine:    { value: 4.0, note: "Use 4.0 for mine office/control rooms (no separate storage)" } },
      dl:        { general: { value: 1.5, note: "Superimposed DL: finish 1.0 + partitions 1.0 (min, IS 875-2 cl 3.1.2)" },
                   mine:    { value: 2.0, note: "Add 0.25–0.5 for coal-dust / services" } },
      floor_dl:  { general: { value: 1.0, note: "Floor finish 50 mm ≈ 1.0 kN/m²" },
                   mine:    { value: 1.5, note: "Industrial heavy-duty floor 1.5 kN/m²" } },
      finish:    { general: { value: 1.0, note: "Screed + tiles 1.0; terrazzo 0.6–1.0" },
                   mine:    { value: 1.5, note: "IPS / heavy-duty topping" } },
      roof_ll:   { general: { value: 1.5, note: "Access 1.5; no access 0.75 (−0.02/° over 10°, min 0.4)" },
                   mine:    { value: 1.5, note: "Plus coal-dust 0.25–0.5 kN/m² as DL near CHP" } },
      roof_dl:   { general: { value: 2.0, note: "Waterproofing + coba 1.5–2.0 kN/m²" },
                   mine:    { value: 2.5, note: "Add dust deposit 0.5" } },
      sheet_dl:  { general: { value: 0.15, note: "GI/colour-coated sheet 0.10–0.15; AC sheet 0.17–0.20" },
                   mine:    { value: 0.6, note: "Sheet 0.15 + purlins 0.1 + services 0.1 + coal dust 0.25 (ASSUMPTION)" } },
      services:  { general: { value: 0.25, note: "Ceiling/lights 0.25–0.5" },
                   mine:    { value: 0.5, note: "Ducts, cable trays 0.5–1.0" } },
      wall_dl:   { general: { value: 13.8, note: "230 mm brick × 3 m × 20 kN/m³ ≈ 13.8 kN/m; 115 mm ≈ 6.9" },
                   mine:    { value: 13.8, note: "Same; fly-ash brick 18–21 kN/m³" } },
      surcharge: { general: { value: 10, note: "General 10; road (IRC 1.2 m fill) 24 kN/m²" },
                   mine:    { value: 24, note: "Mine road ≥ 20–24; haul road: 60 t ≈ 80, 100 t ≈ 110, 240 t ≈ 170 kN/m² (+30% impact) – compute from axle" } },
      sbc:       { general: { value: 150, note: "From soil test (IS 6403/IS 1904, FOS 2.5–3). Typical: soft clay 50–100, medium soil 150, dense gravel 300, rock 450+" },
                   mine:    { value: 100, note: "OB dump / backfill: test only; use 0.8 × SBC; never presume on dumps < 5 yr. ओबी डंप पर मिट्टी परीक्षण अनिवार्य" } },
      gamma:     { general: { value: 18, note: "Soil 16–20 kN/m³" },
                   mine:    { value: 20, note: "OB 18–22; coal 8–9 kN/m³" } },
      phi:       { general: { value: 30, note: "Sand/gravel 30–35°, clayey 20–25°" },
                   mine:    { value: 28, note: "Loose OB / mixed dump 25–30°; coal 35–38° (repose)" } },
      mu:        { general: { value: 0.5, note: "Concrete on soil 0.5; on rock 0.6" },
                   mine:    { value: 0.45, note: "Wet / clayey OB: 0.4–0.45 (conservative)" } },
      vehicle:   { general: { value: "IRC Class A", note: "Class A for all roads; 70R for NH/SH and heavy routes" },
                   mine:    { value: "Dumper (actual fleet)", note: "IRC 70R NOT sufficient for haul roads: BH100 rear axle 1089 kN vs 70R 196 kN. Use dumper preset." } },
      barrier_load: { general: { value: 1.5, note: "Railing 1.5 kN/m (public); IRC crash barrier per IRC:6 cl 209" },
                   mine:    { value: 0, note: "Haul road: use safety bund ≥ ½ wheel height (DGMS) instead of barrier" } },
      wc:        { general: { value: 0.50, note: "Moderate: max 0.50 (IS 456 Table 5)" },
                   mine:    { value: 0.45, note: "Severe/very severe: max 0.45" } },
      exposure:  { general: { value: "Moderate", note: "IS 456 Table 3" },
                   mine:    { value: "Severe", note: "Very severe for mine-water contact, sumps, CHP wash-down. गंभीर" } },
      fck:       { general: { value: 25, note: "Moderate M25; mild M20 (IS 456 Table 5)" },
                   mine:    { value: 30, note: "Severe M30; very severe M35" } },
      cover:     { general: { value: 30, note: "Moderate 30 (IS 456 Table 16); column ≥ 40; footing ≥ 50" },
                   mine:    { value: 45, note: "Severe 45, very severe 50; footing 75 against earth (GP)" } },
      Vb_custom: { general: { value: 39, note: "Chhattisgarh plains 39 m/s (IS 875-3)" },
                   mine:    { value: 44, note: "Korba/Raigarh/Ambikapur: 39 from map; 44 conservative (ASSUMPTION)" } },
      city:      { general: { value: "Raipur", note: "See DS.loadguide.cities" },
                   mine:    { value: "Korba", note: "Korba not in Annex A list – Vb 39 from map" } },
      k1:        { general: { value: 1.0, note: "50-year design life" },
                   mine:    { value: 1.07, note: "CHP, silos, towers, headgear: 100-year (IS 875-3 Table 1)" } },
      terrain:   { general: { value: 2, note: "Category 2 open terrain with few obstructions" },
                   mine:    { value: 1, note: "Open-cast benches / dumps: category 1 (exposed). Township: 3" } },
      importance:{ general: { value: 1.0, note: "IS 1893 Table 8: ordinary 1.0" },
                   mine:    { value: 1.5, note: "De-watering pump house, substation, rescue station, CHP silos: 1.5; > 200 occupants: 1.2" } },
      zone:      { general: { value: "II", note: "Chhattisgarh plains Zone II (Z = 0.10)" },
                   mine:    { value: "II", note: "Korba Zone II; Ambikapur/Jharsuguda/Singrauli III (conservative)" } },
      soil:      { general: { value: "Medium", note: "IS 1893 soil type from SPT N: hard > 30, medium 10–30, soft < 10" },
                   mine:    { value: "Soft", note: "Reclaimed / OB dump: treat as soft (type III) unless tested" } },
      crack:     { general: { value: 0.3, note: "IS 456 cl 35.3.2: 0.3 mm" },
                   mine:    { value: 0.2, note: "Water-retaining / mine water: 0.2 mm (IS 3370-2); 0.1 aggressive" } },
      sigma_st:  { general: { value: 130, note: "IS 3370-2 (WSM) Fe 415/500: 130 N/mm² (0.2 mm), 100 for 0.1 mm (verify table)" },
                   mine:    { value: 100, note: "Aggressive mine water: limit to 100 N/mm² (ASSUMPTION)" } }
    },

    /* ---------------------------------------------------------------- mining-area site profile */
    mine_profile: {
      exposure: { value: "Severe", alt: "Very severe (mine-water contact, sumps, CHP wash-down, buried in OB/coal)", source: "IS 456:2000 Table 3 [CODE classification]" },
      min_fck: { severe: 30, very_severe: 35, any_rcc: 25, source: "IS 456 Table 5 [CODE]" },
      max_wc: { severe: 0.45, very_severe: 0.45, source: "IS 456 Table 5 [CODE]" },
      min_cement: { severe: 320, very_severe: 340, unit: "kg/m³", source: "IS 456 Table 5 [CODE]" },
      min_cover_by_member: { slab: 45, beam: 45, column: 50, wall: 45, footing: 75, culvert: 50, drain: 50, water_tank: 45, unit: "mm",
        note: "IS 456 Table 16: severe 45 / very severe 50 [CODE]; column ≥ 40 (cl 26.4.2.1); footing ≥ 50 (cl 26.4.2.2); 75 against earth [GP]" },
      sbc_reduction_factor: { value: 0.8, note: "On reclaimed / OB dump ground; SBC from soil test only (IS 6403, IS 1904 FOS 2.5–3) [GP/ASSUMPTION]" },
      live_load_dynamic_factor: { value: 1.10, vibrating: 1.25, note: "General mine floors 1.10, vibrating machinery floors 1.25; dumpers see im_haul() [GP]" },
      wind_k1: { value: 1.0, important: 1.07, note: "1.07 for CHP, silos, towers (IS 875-3 Table 1)" },
      importance_factor: { critical: 1.5, occupancy: 1.2, ordinary: 1.0, source: "IS 1893-1:2016 Table 8" },
      surcharge_min: { value: 20, unit: "kN/m²", note: "Next to any mine road; haul roads compute from dumper (≈ 80–170) [GP]" },
      crack_width: { general: 0.3, water_retaining: 0.2, aggressive: 0.1, unit: "mm", source: "IS 456 cl 35.3.2; IS 3370-2:2009" },
      stability_fos: { overturning: 2.0, overturning_seismic: 1.5, sliding: 1.5, sliding_seismic: 1.25, uplift: 1.2, bearing_fos_on_ultimate: 2.5,
        source: "IRC:78 cl 706.3.4 (verify); IS 456 cl 20.1/20.2 gives 1.4; uplift [GP]" },
      blast_ppv_limits: {
        source: "DGMS (Tech)(S&T) Circular No. 7 of 1997 dt 29.08.1997 [CODE – statutory]",
        unit: "mm/s", bands: ["<8 Hz", "8–25 Hz", ">25 Hz"],
        not_owner: {
          domestic: [5, 10, 15],
          industrial_rcc: [10, 20, 25],
          historical_sensitive: [2, 5, 10]
        },
        owner_limited_life: {
          domestic: [10, 15, 25],
          industrial_rcc: [15, 25, 50]
        },
        note: "IS 6922:1973: v = K (R/√Q)^-B, K & B from trial blasts"
      },
      ground_subsidence: [
        "Obtain CMPDI/SECL plan of old underground workings; no building over UG workings without DGMS permission [CODE].",
        "Keep outside angle of draw (15–35° from vertical) of UG workings [GP].",
        "OB dumps settle 5–10 years: raft/piles to original ground; set back ≥ 1.5 × dump height from toe [GP].",
        "Coal-fire / hot ground: avoid RCC within fire zones [GP]."
      ],
      corrosion: {
        default_sulphate_class: 2,
        note: "Test soil & mine water (SO₃, pH). Default IS 456 Table 4 Class 2 until tested; Class 3+ → SRC (IS 12330) / slag cement + bitumen/epoxy coating; pH < 5.5 → protective coating [CODE once tested]",
        source: "IS 456:2000 Table 4, cl 8.2.2"
      },
      dust_deposit_roof: { value: "0.25–0.5", unit: "kN/m²", note: "Near CHP / loading points as additional roof DL [GP/ASSUMPTION]" },
      steel_painting: {
        mine: "Blast Sa 2½; zinc-rich epoxy primer 75 µm + MIO epoxy 2×100 µm + PU 50 µm (DFT ≈ 300–325 µm) or HDG 85 µm (IS 4759) + duplex paint",
        general: "Red-oxide/zinc-phosphate primer + 2 coats synthetic enamel (≈ 120 µm)",
        source: "IS 800:2007 cl 15 (protection required) [CODE]; system per ISO 12944 C4/C5 [GP]"
      },
      culvert: {
        min_cushion_m: { tipper: 0.6, d60: 1.0, d100: 1.2, d150_240: 1.5, d_over_240: 2.0 },
        min_top_slab_mm: { tipper: 200, d60: 300, d100: 350, d150_240: 400, d_over_240: 450 },
        min_reinforcement: "12 mm @ 150 c/c both faces both ways; ≥ 0.12% per face",
        note: "[GP/ASSUMPTION] – see site_research.md §1.4"
      },
      checklist: [
        { level: "critical", text: "Haul-road culverts / walls designed for actual dumper (not IRC 70R)" },
        { level: "critical", text: "Blast PPV at structure within DGMS Circular 7/1997 limits" },
        { level: "critical", text: "No construction over UG workings / within angle of draw without DGMS clearance" },
        { level: "critical", text: "Uplift FOS ≥ 1.2 for sumps, boxes, underground tanks" },
        { level: "critical", text: "Liquid-retaining crack width ≤ 0.2 mm (IS 3370)" },
        { level: "important", text: "Soil & water sulphate/pH test → IS 456 Table 4 class" },
        { level: "important", text: "Severe exposure: M30, w/c ≤ 0.45, 45–50 mm cover" },
        { level: "important", text: "SBC from soil test; no presumed SBC on OB dumps" },
        { level: "important", text: "Seismic I = 1.5 for de-watering pump house, substation" },
        { level: "important", text: "k1 = 1.07 for CHP / tall structures; k3 at dump crests" },
        { level: "important", text: "EOT crane impact 25% vertical, 10% surge (IS 875-2)" },
        { level: "advisory", text: "Coal-dust roof allowance 0.25–0.5 kN/m²" },
        { level: "advisory", text: "C5 paint system / galvanising for exposed steel" },
        { level: "advisory", text: "Safety bund keeps dumper wheels ≥ 1.5 m from walls/drains" },
        { level: "advisory", text: "Weep holes and drainage behind retaining walls" },
        { level: "advisory", text: "Periodic vibration monitoring near blasting" }
      ]
    }
  };
})();
