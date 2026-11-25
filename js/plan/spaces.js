/* Estimate Pro — Building Planner: the space catalogue and the building-type programmes.
   All sizes in metres. A space:
     n / hi       English / Hindi name
     z            zone: 0 open / outside, 1 entry & reception, 2 day / public, 3 service & wet, 4 private / work
     S, M, L      small / normal / large size [width, depth]
     minA, minW   NBC minimum area (m²) and least width (m)
     win          light: "hab" habitable (window ≥ 1/10 floor), "hall" (large windows both sides), "kit" kitchen window, "wet" ventilator, "store" small ventilator, "none"
     circ         1 = other rooms may open off it (living, dining, lobby, corridor, waiting …)
     wet          1 = water and drainage (toilet, kitchen, utility …) — kept together for one plumbing stack
     open         "park" (porch, no walls on the open sides), "balc" (balcony — railing on the open sides)
     fl           "G" ground floor only, "all" every floor, "any", "up" upper floors preferred
     att          key of an attached space carved out of this one (attached toilet / bath)
     furn         furniture set used when the plan is built in CAD
     fin          floor finish of the CAD room
     vastu        preferred directions (N NE E SE S SW W NW) when the Vastu option is on
     asp          largest length / width ratio before the layout is marked down (default 2)
   Sources (indicative — confirm with the local authority before submission):
     NBC 2016 Part 3 / Part 4 minimum room sizes (habitable 9.5 m² / 7.5 m², width 2.4 m; kitchen 5.0 m², width 1.8 m; bath + WC 2.8 m²; WC 1.1 m²; store 3.0 m²),
     NBC 2016 Part 9 sanitary fixtures (office WC 1 / 25 men, 1 / 15 women …),
     CBSE Affiliation Bye-laws 2018 ch. 4 (class room 8 × 6 m, 1 m² per student; science / computer lab 9 × 6 m; library 14 × 8 m),
     AICTE Approval Process Handbook (lecture room 66 m², tutorial 33 m², lab 66 m², drawing hall 132 m², seminar hall 132 m², computer centre 150 m², library 400 m²),
     IPHS 2022 (CHC 30 beds), Ministry of Tourism hotel guidelines (room 120 sq ft excl. bath at 1-star, 200 sq ft at 5-star; bath 30 sq ft and more),
     DoPT canteen scale (about 0.9 m² per person served) and common catering practice (kitchen ≈ 40 % of the dining area). */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, PL = EP.plan = EP.plan || {};
  function s(o) { return o; }
  var SP = PL.SPACES = {
    /* ---------- house ---------- */
    car_park: s({ n: "Car parking / porch", hi: "कार पार्किंग / पोर्च", z: 0, S: [2.7, 5.0], M: [3.0, 5.4], L: [3.6, 5.7], minW: 2.5, open: "park", fl: "G", fin: "kota", win: "none", vastu: ["NW", "SE", "N", "E"], asp: 2.6 }),
    bike_park: s({ n: "Two-wheeler parking", hi: "बाइक पार्किंग", z: 0, S: [1.5, 2.4], M: [1.8, 2.7], L: [2.4, 3.0], minW: 1.2, open: "park", fl: "G", fin: "kota", win: "none", asp: 3 }),
    sitout: s({ n: "Sit-out / verandah", hi: "बरामदा", z: 0, S: [1.5, 2.4], M: [1.8, 3.0], L: [2.4, 3.6], minW: 1.2, open: "park", fl: "G", fin: "kota", win: "none", asp: 3.5 }),
    living: s({ n: "Drawing / living room", hi: "ड्रॉइंग / बैठक", z: 1, S: [3.3, 3.6], M: [3.6, 4.2], L: [4.2, 5.1], minA: 9.5, minW: 2.4, win: "hab", circ: 1, fl: "G", furn: "living", vastu: ["N", "E", "NE", "NW"], main: 1 }),
    dining: s({ n: "Dining hall", hi: "डाइनिंग हॉल", z: 2, S: [2.7, 3.0], M: [3.3, 3.6], L: [3.6, 4.5], minA: 7.5, minW: 2.4, win: "hab", circ: 1, fl: "G", furn: "dining", vastu: ["W", "E", "C"] }),
    kitchen: s({ n: "Kitchen", hi: "रसोई", z: 3, S: [2.4, 2.7], M: [2.7, 3.3], L: [3.0, 3.9], minA: 5.0, minW: 1.8, wet: 1, win: "kit", fl: "G", furn: "kitchen", fin: "vitrified", vastu: ["SE", "NW"], door: "D2" }),
    store: s({ n: "Store", hi: "स्टोर", z: 3, S: [1.5, 1.8], M: [1.8, 2.1], L: [2.1, 2.4], minA: 3.0, minW: 1.2, win: "store", furn: "store", fin: "ceramic", vastu: ["SW", "S", "W"], door: "D2", asp: 2.5 }),
    utility: s({ n: "Utility / wash area", hi: "यूटिलिटी / धुलाई", z: 3, S: [1.2, 1.8], M: [1.5, 2.4], L: [1.8, 2.7], minW: 1.2, wet: 1, win: "wet", fl: "G", fin: "ceramic", furn: "utility", vastu: ["NW", "SE"], door: "D3", asp: 2.6 }),
    pooja: s({ n: "Pooja room", hi: "पूजा कक्ष", z: 2, S: [1.2, 1.5], M: [1.5, 1.8], L: [1.8, 2.4], minW: 1.2, win: "store", fl: "G", furn: "pooja", fin: "granite", vastu: ["NE", "E", "N"], door: "D3" }),
    master: s({ n: "Master bed room", hi: "मास्टर बेडरूम", z: 4, S: [3.3, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minA: 9.5, minW: 2.4, win: "hab", att: "toilet_att", furn: "bed2", vastu: ["SW"] }),
    bed: s({ n: "Bed room", hi: "बेडरूम", z: 4, S: [3.0, 3.0], M: [3.0, 3.6], L: [3.6, 3.9], minA: 7.5, minW: 2.4, win: "hab", furn: "bed2", vastu: ["S", "W", "NW"] }),
    bed_att: s({ n: "Bed room", hi: "बेडरूम + अटैच्ड टॉयलेट", z: 4, S: [3.0, 3.3], M: [3.3, 3.6], L: [3.6, 4.2], minA: 7.5, minW: 2.4, win: "hab", att: "toilet_att", furn: "bed2", vastu: ["S", "W", "NW"] }),
    kids: s({ n: "Children's bed room", hi: "बच्चों का कमरा", z: 4, S: [3.0, 3.0], M: [3.0, 3.3], L: [3.3, 3.6], minA: 7.5, minW: 2.4, win: "hab", furn: "bed1", vastu: ["W", "NW", "E"] }),
    guest: s({ n: "Guest room", hi: "गेस्ट रूम", z: 4, S: [3.0, 3.0], M: [3.0, 3.6], L: [3.6, 3.9], minA: 7.5, minW: 2.4, win: "hab", att: "toilet_att", fl: "G", furn: "bed2", vastu: ["NW"] }),
    elders: s({ n: "Parents' bed room", hi: "माता-पिता का कमरा", z: 4, S: [3.0, 3.3], M: [3.3, 3.6], L: [3.6, 4.2], minA: 7.5, minW: 2.4, win: "hab", att: "toilet_att", fl: "G", furn: "bed2", vastu: ["SW", "S", "W"] }),
    study: s({ n: "Study / home office", hi: "स्टडी रूम", z: 4, S: [2.4, 2.7], M: [2.7, 3.0], L: [3.0, 3.6], minA: 7.5, minW: 2.4, win: "hab", furn: "study", vastu: ["N", "E", "W", "NE"] }),
    lounge: s({ n: "Family lounge", hi: "फैमिली लाउंज", z: 2, S: [3.0, 3.3], M: [3.6, 3.9], L: [4.2, 4.8], minA: 7.5, minW: 2.4, win: "hab", circ: 1, fl: "up", furn: "lounge" }),
    toilet_att: s({ n: "Toilet", hi: "अटैच्ड टॉयलेट", z: 3, S: [1.2, 2.1], M: [1.5, 2.4], L: [1.8, 2.7], minA: 2.8, minW: 1.2, wet: 1, win: "wet", furn: "wc", fin: "ceramic", door: "D3", asp: 2.4 }),
    toilet: s({ n: "Common toilet", hi: "कॉमन टॉयलेट", z: 3, S: [1.2, 2.1], M: [1.5, 2.4], L: [1.8, 2.7], minA: 2.8, minW: 1.2, wet: 1, win: "wet", furn: "wc", fin: "ceramic", door: "D3", vastu: ["NW", "W", "S"], asp: 2.4 }),
    wc: s({ n: "WC (powder room)", hi: "डब्ल्यूसी", z: 3, S: [0.9, 1.2], M: [1.0, 1.5], L: [1.2, 1.8], minA: 1.1, minW: 0.9, wet: 1, win: "wet", furn: "wc1", fin: "ceramic", door: "D11", asp: 2.4 }),
    balcony: s({ n: "Balcony", hi: "बालकनी", z: 0, S: [1.2, 3.0], M: [1.5, 3.6], L: [1.8, 4.2], minW: 1.0, open: "balc", fl: "up", fin: "ceramic", win: "none", asp: 4 }),
    servant: s({ n: "Staff / servant room", hi: "सर्वेंट रूम", z: 3, S: [2.4, 2.7], M: [2.7, 3.0], L: [3.0, 3.3], minA: 7.5, minW: 2.1, win: "hab", fl: "G", furn: "bed1" }),
    passage: s({ n: "Passage", hi: "पैसेज", z: 2, S: [1.0, 3.0], M: [1.1, 4.0], L: [1.2, 5.0], minW: 1.0, circ: 1, win: "none", asp: 99, auto: 1 }),
    stair: s({ n: "Staircase", hi: "सीढ़ी", z: 3, S: [2.4, 4.2], M: [2.4, 4.5], L: [2.7, 4.8], minW: 2.0, win: "store", fl: "all", stair: 1, fin: "granite", asp: 2.6 }),
    lift: s({ n: "Lift", hi: "लिफ़्ट", z: 3, S: [1.8, 1.8], M: [2.0, 2.2], L: [2.4, 2.8], minW: 1.8, win: "none", fl: "all", lift: 1, fin: "granite", asp: 1.6 }),
    /* ---------- office ---------- */
    reception: s({ n: "Reception & waiting", hi: "रिसेप्शन / प्रतीक्षा", z: 1, S: [3.6, 4.2], M: [4.5, 5.4], L: [6.0, 6.0], minW: 3.0, win: "hab", circ: 1, fl: "G", furn: "reception", main: 1, vastu: ["N", "E", "NE"], asp: 2.6 }),
    cabin_head: s({ n: "Head / MD cabin", hi: "प्रमुख का केबिन", z: 4, S: [3.6, 4.2], M: [4.2, 4.8], L: [4.8, 5.4], minW: 3.0, win: "hab", att: "toilet_att", furn: "cabin_big", vastu: ["SW", "S", "W"] }),
    cabin: s({ n: "Officer cabin", hi: "अधिकारी केबिन", z: 4, S: [2.7, 3.3], M: [3.0, 3.6], L: [3.6, 4.2], minW: 2.4, win: "hab", furn: "cabin" }),
    openoff: s({ n: "Open office (workstations)", hi: "वर्कस्टेशन हॉल", z: 2, S: [6, 6], M: [6, 8], L: [8, 10], minW: 4.0, win: "hall", furn: "work", per: 5.5, asp: 3.5 }),
    conf: s({ n: "Conference / meeting room", hi: "मीटिंग हॉल", z: 4, S: [3.6, 4.5], M: [4.5, 6.0], L: [6.0, 8.0], minW: 3.3, win: "hab", furn: "conf", per: 2.2, asp: 2.6 }),
    pantry: s({ n: "Pantry", hi: "पैंट्री", z: 3, S: [2.1, 2.4], M: [2.4, 3.0], L: [3.0, 3.6], minW: 1.8, wet: 1, win: "kit", furn: "pantry", fin: "ceramic", door: "D2" }),
    server: s({ n: "Server / IT room", hi: "सर्वर रूम", z: 3, S: [2.4, 2.7], M: [2.7, 3.0], L: [3.0, 3.6], minW: 2.1, win: "none", furn: "store" }),
    records: s({ n: "Records / file room", hi: "रिकॉर्ड रूम", z: 3, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.4, win: "store", furn: "records" }),
    security: s({ n: "Security / guard room", hi: "गार्ड रूम", z: 1, S: [2.1, 2.4], M: [2.4, 2.7], L: [2.7, 3.0], minW: 1.8, win: "hab", fl: "G", furn: "cabin" }),
    elec: s({ n: "Electrical panel room", hi: "इलेक्ट्रिकल पैनल रूम", z: 3, S: [2.1, 2.4], M: [2.4, 3.0], L: [3.0, 3.6], minW: 1.8, win: "store", fl: "G", furn: "store" }),
    toilet_m: s({ n: "Gents toilet", hi: "पुरुष शौचालय", z: 3, S: [2.4, 3.0], M: [3.0, 3.6], L: [3.6, 4.2], minW: 1.8, wet: 1, win: "wet", fl: "all", furn: "tblock_m", fin: "ceramic", door: "D2", block: 1, asp: 3 }),
    toilet_f: s({ n: "Ladies toilet", hi: "महिला शौचालय", z: 3, S: [2.4, 3.0], M: [3.0, 3.6], L: [3.6, 4.2], minW: 1.8, wet: 1, win: "wet", fl: "all", furn: "tblock_f", fin: "ceramic", door: "D2", block: 1, asp: 3 }),
    toilet_pwd: s({ n: "Accessible toilet (divyang)", hi: "दिव्यांग शौचालय", z: 3, S: [1.8, 2.2], M: [1.8, 2.2], L: [2.0, 2.4], minW: 1.8, wet: 1, win: "wet", fl: "all", furn: "wc", fin: "ceramic", door: "D2", asp: 1.6 }),
    store_g: s({ n: "Store", hi: "स्टोर", z: 3, S: [2.4, 3.0], M: [3.0, 3.6], L: [3.6, 4.2], minW: 2.1, win: "store", furn: "records", fin: "ceramic", door: "D2" }),
    /* ---------- canteen / kitchen ---------- */
    din_hall: s({ n: "Dining hall", hi: "भोजन कक्ष", z: 1, S: [6, 6], M: [8, 8], L: [10, 10], minW: 4.5, win: "hall", circ: 1, fl: "G", furn: "canteen", main: 1, per: 1.2, asp: 3 }),
    serve: s({ n: "Serving counter", hi: "सर्विंग काउंटर", z: 2, S: [2.4, 3.6], M: [3.0, 4.5], L: [3.6, 6.0], minW: 2.1, win: "none", furn: "serve", fin: "ceramic", asp: 3.5 }),
    ckitchen: s({ n: "Cooking area (kitchen)", hi: "रसोई (कुकिंग)", z: 3, S: [4.0, 5.0], M: [5.0, 6.0], L: [6.0, 8.0], minW: 3.0, wet: 1, win: "kit", furn: "ckitchen", fin: "ceramic", door: "D4", asp: 2.6 }),
    prep: s({ n: "Preparation area", hi: "तैयारी क्षेत्र", z: 3, S: [2.4, 3.6], M: [3.0, 4.2], L: [3.6, 4.8], minW: 2.1, wet: 1, win: "kit", furn: "prep", fin: "ceramic", door: "D4" }),
    dish: s({ n: "Dish wash area", hi: "बर्तन धुलाई", z: 3, S: [2.1, 2.4], M: [2.4, 3.0], L: [3.0, 3.6], minW: 1.8, wet: 1, win: "wet", furn: "dish", fin: "ceramic", door: "D2" }),
    dstore: s({ n: "Dry store", hi: "सूखा भंडार", z: 3, S: [2.1, 2.4], M: [2.4, 3.0], L: [3.0, 3.6], minW: 1.8, win: "store", furn: "records", fin: "ceramic", door: "D2" }),
    cstore: s({ n: "Cold store (refrigerators)", hi: "कोल्ड स्टोर", z: 3, S: [1.8, 2.1], M: [2.1, 2.4], L: [2.4, 3.0], minW: 1.5, win: "none", furn: "cold", fin: "ceramic", door: "D2" }),
    handwash: s({ n: "Hand wash area", hi: "हाथ धोने की जगह", z: 2, S: [1.5, 2.4], M: [1.8, 3.0], L: [2.1, 3.6], minW: 1.2, wet: 1, win: "wet", furn: "handwash", fin: "ceramic", asp: 3 }),
    manager: s({ n: "Manager / cash", hi: "मैनेजर / कैश", z: 1, S: [2.4, 2.7], M: [2.7, 3.0], L: [3.0, 3.6], minW: 2.1, win: "hab", furn: "cabin" }),
    staffchg: s({ n: "Staff changing room", hi: "स्टाफ चेंजिंग रूम", z: 3, S: [2.1, 2.4], M: [2.4, 3.0], L: [3.0, 3.6], minW: 1.8, win: "wet", furn: "locker", fin: "ceramic", door: "D2" }),
    /* ---------- school ---------- */
    classroom: s({ n: "Class room", hi: "कक्षा", z: 4, S: [7.2, 6.0], M: [8.0, 6.0], L: [9.0, 6.6], minA: 48, minW: 5.4, win: "hall", furn: "class", per: 1.0, asp: 1.8 }),
    sci_lab: s({ n: "Science laboratory", hi: "विज्ञान प्रयोगशाला", z: 4, S: [9, 6], M: [9, 6], L: [10, 7.2], minA: 54, minW: 6, win: "hall", wet: 1, furn: "lab", asp: 1.9 }),
    phy_lab: s({ n: "Physics laboratory", hi: "भौतिकी प्रयोगशाला", z: 4, S: [9, 6], M: [9, 6], L: [10, 7.2], minA: 54, minW: 6, win: "hall", furn: "lab", asp: 1.9 }),
    chem_lab: s({ n: "Chemistry laboratory", hi: "रसायन प्रयोगशाला", z: 4, S: [9, 6], M: [9, 6], L: [10, 7.2], minA: 54, minW: 6, win: "hall", wet: 1, furn: "lab", asp: 1.9 }),
    bio_lab: s({ n: "Biology laboratory", hi: "जीव विज्ञान प्रयोगशाला", z: 4, S: [9, 6], M: [9, 6], L: [10, 7.2], minA: 54, minW: 6, win: "hall", wet: 1, furn: "lab", asp: 1.9 }),
    comp_lab: s({ n: "Computer laboratory", hi: "कंप्यूटर लैब", z: 4, S: [9, 6], M: [9, 6], L: [10, 7.2], minA: 54, minW: 6, win: "hall", furn: "comp", asp: 1.9 }),
    math_lab: s({ n: "Mathematics laboratory", hi: "गणित लैब", z: 4, S: [8, 6], M: [8, 6], L: [9, 6], minA: 46.5, minW: 6, win: "hall", furn: "lab", asp: 1.9 }),
    library: s({ n: "Library & reading room", hi: "पुस्तकालय", z: 2, S: [12, 7], M: [14, 8], L: [16, 9], minA: 112, minW: 6, win: "hall", furn: "library", asp: 2.8 }),
    principal: s({ n: "Principal's room", hi: "प्राचार्य कक्ष", z: 1, S: [3.6, 4.2], M: [4.2, 4.8], L: [4.8, 5.4], minW: 3.0, win: "hab", att: "toilet_att", fl: "G", furn: "cabin_big" }),
    sch_office: s({ n: "School office", hi: "कार्यालय", z: 1, S: [3.6, 4.2], M: [4.2, 5.4], L: [5.4, 6.0], minW: 3.0, win: "hab", fl: "G", furn: "office" }),
    staffroom: s({ n: "Staff room", hi: "स्टाफ रूम", z: 2, S: [4.2, 4.8], M: [4.8, 6.0], L: [6.0, 7.2], minW: 3.6, win: "hab", furn: "staff", per: 2.5 }),
    sick: s({ n: "Sick bay / medical room", hi: "मेडिकल रूम", z: 2, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "sick" }),
    activity: s({ n: "Activity / music room", hi: "एक्टिविटी रूम", z: 4, S: [7.2, 6.0], M: [8, 6], L: [9, 6.6], minW: 5.4, win: "hall", furn: "none", asp: 1.9 }),
    artroom: s({ n: "Art & craft room", hi: "कला कक्ष", z: 4, S: [7.2, 6.0], M: [8, 6], L: [9, 6.6], minW: 5.4, win: "hall", wet: 1, furn: "lab", asp: 1.9 }),
    counsel: s({ n: "Counsellor room", hi: "काउंसलर कक्ष", z: 2, S: [2.7, 3.0], M: [3.0, 3.6], L: [3.6, 4.2], minW: 2.4, win: "hab", furn: "cabin" }),
    mphall: s({ n: "Multipurpose hall", hi: "बहुउद्देशीय हॉल", z: 2, S: [10, 8], M: [12, 9], L: [15, 10], minW: 7, win: "hall", circ: 1, fl: "G", furn: "none", asp: 2.4 }),
    water: s({ n: "Drinking water point", hi: "पेयजल स्थान", z: 3, S: [1.5, 2.4], M: [1.8, 2.7], L: [2.1, 3.0], minW: 1.2, wet: 1, win: "none", fl: "all", furn: "handwash", fin: "ceramic", asp: 3 }),
    toilet_b: s({ n: "Boys toilet", hi: "बालक शौचालय", z: 3, S: [3, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.1, wet: 1, win: "wet", fl: "all", furn: "tblock_m", fin: "ceramic", door: "D2", block: 1, asp: 3 }),
    toilet_g: s({ n: "Girls toilet", hi: "बालिका शौचालय", z: 3, S: [3, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.1, wet: 1, win: "wet", fl: "all", furn: "tblock_f", fin: "ceramic", door: "D2", block: 1, asp: 3 }),
    /* ---------- college (AICTE carpet areas) ---------- */
    lecture: s({ n: "Lecture room (60 students)", hi: "व्याख्यान कक्ष", z: 4, S: [9.2, 7.2], M: [9.2, 7.2], L: [10, 7.5], minA: 66, minW: 6.6, win: "hall", furn: "lecture", asp: 1.8 }),
    tutorial: s({ n: "Tutorial room", hi: "ट्यूटोरियल कक्ष", z: 4, S: [4.6, 7.2], M: [4.6, 7.2], L: [5, 7.2], minA: 33, minW: 4.2, win: "hab", furn: "tutorial", asp: 1.8 }),
    lab66: s({ n: "Laboratory", hi: "प्रयोगशाला", z: 4, S: [9.2, 7.2], M: [9.2, 7.2], L: [10, 7.5], minA: 66, minW: 6.6, win: "hall", wet: 1, furn: "lab", asp: 1.8 }),
    drawing: s({ n: "Drawing hall", hi: "ड्रॉइंग हॉल", z: 4, S: [18.4, 7.2], M: [18.4, 7.2], L: [20, 7.5], minA: 132, minW: 7, win: "hall", furn: "drawing", asp: 2.8 }),
    compctr: s({ n: "Computer centre", hi: "कंप्यूटर सेंटर", z: 4, S: [15, 7.2], M: [20.8, 7.2], L: [22, 7.5], minA: 75, minW: 7, win: "hall", furn: "comp", asp: 3.2 }),
    seminar: s({ n: "Seminar hall", hi: "सेमिनार हॉल", z: 2, S: [18.4, 7.2], M: [18.4, 7.2], L: [20, 8], minA: 132, minW: 7, win: "hall", fl: "G", furn: "seminar", asp: 2.8 }),
    clibrary: s({ n: "Central library", hi: "केंद्रीय पुस्तकालय", z: 2, S: [20.8, 7.2], M: [27.8, 14.4], L: [30, 15], minA: 150, minW: 7, win: "hall", furn: "library", asp: 3.2 }),
    workshop: s({ n: "Workshop", hi: "वर्कशॉप", z: 4, S: [20, 10], M: [20, 10], L: [24, 12], minA: 200, minW: 8, win: "hall", fl: "G", furn: "none", asp: 2.6 }),
    faculty: s({ n: "Faculty room", hi: "फैकल्टी कक्ष", z: 4, S: [3.0, 3.3], M: [3.0, 3.6], L: [3.3, 3.9], minA: 10, minW: 2.7, win: "hab", furn: "cabin" }),
    hod: s({ n: "HOD room", hi: "विभागाध्यक्ष कक्ष", z: 4, S: [3.9, 4.8], M: [4.2, 4.8], L: [4.8, 5.4], minA: 20, minW: 3.3, win: "hab", furn: "cabin_big" }),
    deptoff: s({ n: "Department office", hi: "विभाग कार्यालय", z: 2, S: [4.2, 6.0], M: [4.2, 6.0], L: [5.4, 6.0], minA: 25, minW: 3.6, win: "hab", furn: "office" }),
    adminoff: s({ n: "Administrative office", hi: "प्रशासनिक कार्यालय", z: 1, S: [6, 8], M: [7.2, 10], L: [8, 12], minW: 5, win: "hall", fl: "G", furn: "office", asp: 2.6 }),
    exam: s({ n: "Examination cell", hi: "परीक्षा विभाग", z: 2, S: [4.2, 6.0], M: [5, 6], L: [6, 7.2], minA: 30, minW: 3.6, win: "hab", furn: "records" }),
    commonb: s({ n: "Boys common room", hi: "छात्र कॉमन रूम", z: 2, S: [7.2, 7.2], M: [9, 8.3], L: [10, 9], minW: 6, win: "hall", furn: "lounge_big" }),
    commong: s({ n: "Girls common room", hi: "छात्रा कॉमन रूम", z: 2, S: [7.2, 7.2], M: [9, 8.3], L: [10, 9], minW: 6, win: "hall", furn: "lounge_big" }),
    cafeteria: s({ n: "Cafeteria", hi: "कैफेटेरिया", z: 2, S: [10, 10], M: [12, 12.5], L: [14, 14], minA: 150, minW: 8, win: "hall", circ: 1, fl: "G", wet: 1, furn: "canteen", asp: 2.2 }),
    /* ---------- hospital (IPHS-style CHC) ---------- */
    registration: s({ n: "Registration & enquiry", hi: "पंजीयन / पूछताछ", z: 1, S: [3.6, 4.8], M: [4.8, 6.0], L: [6.0, 7.2], minW: 3.0, win: "hab", circ: 1, fl: "G", furn: "reception", main: 1, asp: 2.4 }),
    opd_wait: s({ n: "OPD waiting", hi: "ओपीडी प्रतीक्षा", z: 1, S: [6, 6], M: [6, 8], L: [8, 10], minW: 4.0, win: "hall", circ: 1, fl: "G", furn: "waiting", asp: 3 }),
    opd: s({ n: "OPD consultation room", hi: "ओपीडी कक्ष", z: 2, S: [3.0, 3.6], M: [3.3, 3.9], L: [3.6, 4.2], minW: 2.7, win: "hab", fl: "G", furn: "opd" }),
    emergency: s({ n: "Emergency / casualty", hi: "आपातकालीन कक्ष", z: 1, S: [6.0, 6.0], M: [6.0, 8.0], L: [8.0, 9.0], minW: 4.5, win: "hab", fl: "G", furn: "ward", wet: 1, asp: 2.4 }),
    pharmacy: s({ n: "Pharmacy / dispensary", hi: "फार्मेसी", z: 1, S: [3.6, 4.2], M: [4.2, 4.8], L: [4.8, 6.0], minW: 3.0, win: "hab", fl: "G", furn: "records" }),
    hlab: s({ n: "Pathology laboratory", hi: "पैथोलॉजी लैब", z: 2, S: [4.2, 4.8], M: [4.8, 6.0], L: [6.0, 7.2], minW: 3.6, win: "hab", wet: 1, fl: "G", furn: "lab" }),
    xray: s({ n: "X-ray room", hi: "एक्स-रे कक्ष", z: 2, S: [4.2, 5.4], M: [4.5, 6.0], L: [5.4, 6.0], minW: 4.0, win: "none", fl: "G", furn: "none" }),
    labour: s({ n: "Labour room", hi: "प्रसव कक्ष", z: 4, S: [4.8, 6.0], M: [5.4, 6.0], L: [6.0, 7.2], minW: 4.2, win: "hab", wet: 1, att: "toilet_att", furn: "ward" }),
    ot: s({ n: "Operation theatre", hi: "ऑपरेशन थिएटर", z: 4, S: [5.4, 6.0], M: [6.0, 6.0], L: [6.6, 7.2], minW: 5.4, win: "none", furn: "none" }),
    preop: s({ n: "Pre-op / recovery", hi: "प्री-ऑप / रिकवरी", z: 4, S: [4.2, 6.0], M: [4.8, 6.0], L: [6.0, 7.2], minW: 3.6, win: "hab", furn: "ward" }),
    cssd: s({ n: "Scrub & CSSD", hi: "स्क्रब / सीएसएसडी", z: 3, S: [3.0, 3.6], M: [3.0, 4.2], L: [3.6, 4.8], minW: 2.4, wet: 1, win: "wet", furn: "dish" }),
    ward: s({ n: "General ward", hi: "सामान्य वार्ड", z: 4, S: [6, 7.2], M: [6, 8.4], L: [7.2, 9.6], minW: 5.4, win: "hall", furn: "ward", per: 8, asp: 2.2 }),
    privroom: s({ n: "Private room", hi: "निजी कक्ष", z: 4, S: [3.3, 3.9], M: [3.6, 4.2], L: [3.9, 4.8], minW: 3.0, win: "hab", att: "toilet_att", furn: "ward1" }),
    isolation: s({ n: "Isolation room", hi: "आइसोलेशन कक्ष", z: 4, S: [3.3, 3.9], M: [3.6, 4.2], L: [3.9, 4.8], minW: 3.0, win: "hab", att: "toilet_att", furn: "ward1" }),
    nurse: s({ n: "Nurses' station", hi: "नर्स स्टेशन", z: 2, S: [2.4, 3.0], M: [3.0, 3.6], L: [3.6, 4.2], minW: 2.4, win: "none", fl: "all", furn: "reception" }),
    duty: s({ n: "Doctors' duty room", hi: "डॉक्टर ड्यूटी कक्ष", z: 4, S: [3.0, 3.3], M: [3.0, 3.6], L: [3.6, 4.2], minW: 2.7, win: "hab", att: "toilet_att", furn: "bed1" }),
    dietary: s({ n: "Kitchen (dietary)", hi: "रसोई (आहार)", z: 3, S: [4.2, 5.4], M: [5.0, 6.0], L: [6.0, 7.2], minW: 3.6, wet: 1, win: "kit", fl: "G", furn: "ckitchen", fin: "ceramic", door: "D4" }),
    laundry: s({ n: "Laundry / linen", hi: "लॉन्ड्री", z: 3, S: [3.0, 3.6], M: [3.0, 4.2], L: [3.6, 4.8], minW: 2.4, wet: 1, win: "wet", fl: "G", furn: "utility", fin: "ceramic" }),
    mstore: s({ n: "Medical store", hi: "मेडिकल स्टोर", z: 3, S: [3.6, 4.2], M: [3.6, 4.8], L: [4.8, 6.0], minW: 3.0, win: "store", furn: "records" }),
    /* ---------- hotel / hostel ---------- */
    hlobby: s({ n: "Lobby & reception", hi: "लॉबी / रिसेप्शन", z: 1, S: [6, 6], M: [6, 8], L: [8, 10], minW: 4.5, win: "hall", circ: 1, fl: "G", furn: "lobby", main: 1, asp: 2.6 }),
    restaurant: s({ n: "Restaurant", hi: "रेस्टोरेंट", z: 2, S: [6, 8], M: [8, 10], L: [10, 12], minW: 5.4, win: "hall", circ: 1, fl: "G", furn: "canteen", per: 1.5, asp: 2.6 }),
    hkitchen: s({ n: "Hotel kitchen", hi: "होटल रसोई", z: 3, S: [4.2, 5.4], M: [5.0, 6.0], L: [6.0, 8.0], minW: 3.6, wet: 1, win: "kit", fl: "G", furn: "ckitchen", fin: "ceramic", door: "D4" }),
    banquet: s({ n: "Banquet / conference hall", hi: "बैंक्वेट हॉल", z: 2, S: [10, 10], M: [12, 12], L: [15, 15], minW: 8, win: "hall", fl: "G", furn: "none", per: 1.2, asp: 2.6 }),
    froom: s({ n: "Front office / manager", hi: "फ्रंट ऑफिस", z: 1, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "office" }),
    hk: s({ n: "Housekeeping / linen room", hi: "हाउसकीपिंग / लिनेन", z: 3, S: [2.1, 2.4], M: [2.4, 3.0], L: [3.0, 3.6], minW: 1.8, win: "store", fl: "all", furn: "records" }),
    groom: s({ n: "Guest room", hi: "अतिथि कक्ष", z: 4, S: [3.3, 3.6], M: [3.6, 4.2], L: [4.2, 4.5], minW: 3.0, win: "hab", att: "bath_h", furn: "hotel" }),
    suite: s({ n: "Suite", hi: "सुइट", z: 4, S: [5.4, 5.4], M: [6.0, 6.0], L: [7.2, 6.6], minW: 4.2, win: "hab", att: "bath_h", furn: "suite" }),
    bath_h: s({ n: "Bath room", hi: "स्नानघर", z: 3, S: [1.5, 1.8], M: [1.5, 2.1], L: [1.8, 2.4], minA: 2.8, minW: 1.2, wet: 1, win: "wet", furn: "bath", fin: "ceramic", door: "D3", asp: 2.4 }),
    hstaff: s({ n: "Staff room & lockers", hi: "स्टाफ रूम", z: 3, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "locker" }),
    hroom: s({ n: "Hostel room", hi: "हॉस्टल कक्ष", z: 4, S: [3.0, 3.6], M: [3.3, 3.9], L: [3.6, 4.2], minW: 2.7, win: "hab", furn: "hostel" }),
    warden: s({ n: "Warden room", hi: "वार्डन कक्ष", z: 1, S: [3.3, 3.6], M: [3.6, 4.2], L: [4.2, 4.5], minW: 3.0, win: "hab", att: "toilet_att", fl: "G", furn: "bed2" }),
    mess: s({ n: "Mess / dining hall", hi: "मेस / भोजन कक्ष", z: 2, S: [6, 8], M: [8, 10], L: [10, 12], minW: 5.4, win: "hall", circ: 1, fl: "G", furn: "canteen", per: 1.0, asp: 2.6 }),
    commonr: s({ n: "Common / TV room", hi: "कॉमन रूम", z: 2, S: [4.8, 6.0], M: [6.0, 7.2], L: [7.2, 8.4], minW: 4.2, win: "hall", furn: "lounge_big" }),
    visitors: s({ n: "Visitors' room", hi: "आगंतुक कक्ष", z: 1, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "living" }),
    bath_blk: s({ n: "Bath & toilet block", hi: "स्नान / शौचालय ब्लॉक", z: 3, S: [3.0, 3.6], M: [3.6, 4.8], L: [4.2, 6.0], minW: 2.4, wet: 1, win: "wet", fl: "all", furn: "tblock_m", fin: "ceramic", door: "D2", block: 1, asp: 3 }),
    /* ---------- community hall ---------- */
    chall: s({ n: "Main hall", hi: "मुख्य हॉल", z: 1, S: [12, 10], M: [15, 12], L: [20, 15], minW: 8, win: "hall", circ: 1, fl: "G", furn: "none", main: 1, per: 1.0, asp: 2.4 }),
    stage: s({ n: "Stage", hi: "मंच", z: 2, S: [6, 4], M: [8, 4.5], L: [10, 5], minW: 3.6, win: "none", fl: "G", furn: "none", asp: 3 }),
    green: s({ n: "Green room", hi: "ग्रीन रूम", z: 4, S: [3.0, 3.3], M: [3.0, 3.6], L: [3.6, 4.2], minW: 2.7, win: "hab", att: "toilet_att", fl: "G", furn: "cabin" }),
    hall_kit: s({ n: "Kitchen", hi: "रसोई", z: 3, S: [3.6, 4.2], M: [4.2, 5.4], L: [5.4, 6.0], minW: 3.0, wet: 1, win: "kit", fl: "G", furn: "ckitchen", fin: "ceramic", door: "D4" }),
    /* ---------- apartments, shops, factory, government buildings ---------- */
    flat: s({ n: "Flat", hi: "फ़्लैट", z: 4, S: [7.2, 9.0], M: [7.8, 9.0], L: [9.6, 9.6], minW: 6.0, win: "hab", unit: 1, furn: "none", asp: 2.2 }),
    flobby: s({ n: "Entrance lobby", hi: "प्रवेश लॉबी", z: 1, S: [3.6, 4.2], M: [4.5, 6.0], L: [6.0, 7.2], minW: 3.0, win: "hab", circ: 1, fl: "G", furn: "lobby", main: 1, asp: 2.6 }),
    stilt: s({ n: "Stilt parking", hi: "स्टिल्ट पार्किंग", z: 0, S: [10, 10], M: [12, 12], L: [15, 15], minW: 5.0, open: "park", fl: "G", fin: "kota", win: "none", asp: 4 }),
    shop: s({ n: "Shop", hi: "दुकान", z: 1, S: [3.0, 4.5], M: [3.6, 6.0], L: [4.5, 7.5], minW: 2.7, win: "none", fl: "G", shop: 1, furn: "shop", fin: "vitrified", asp: 2.6 }),
    showroom: s({ n: "Showroom / office hall", hi: "शोरूम / ऑफ़िस हॉल", z: 2, S: [6, 8], M: [8, 10], L: [10, 12], minW: 5.0, win: "hall", furn: "work", asp: 2.6 }),
    prodhall: s({ n: "Production hall", hi: "प्रोडक्शन हॉल", z: 2, S: [15, 20], M: [20, 30], L: [24, 40], minW: 12, win: "hall", circ: 1, fl: "G", furn: "none", main: 1, fin: "ips", asp: 3 }),
    godown: s({ n: "Godown / store", hi: "गोदाम", z: 3, S: [10, 15], M: [12, 20], L: [15, 25], minW: 8, win: "store", fl: "G", furn: "none", fin: "ips", door: "RS1", asp: 3 }),
    loading: s({ n: "Loading / unloading bay", hi: "लोडिंग बे", z: 0, S: [4, 8], M: [5, 10], L: [6, 12], minW: 3.6, open: "park", fl: "G", fin: "ips", win: "none", asp: 3 }),
    fofice: s({ n: "Factory office", hi: "फ़ैक्ट्री ऑफ़िस", z: 1, S: [3.6, 4.2], M: [4.2, 6.0], L: [6, 7.2], minW: 3.0, win: "hab", fl: "G", furn: "office" }),
    awhall: s({ n: "Activity room (children)", hi: "गतिविधि कक्ष", z: 1, S: [5.0, 6.0], M: [6.0, 6.0], L: [6.0, 7.5], minW: 4.5, win: "hall", circ: 1, fl: "G", furn: "none", main: 1, asp: 2 }),
    awkit: s({ n: "Kitchen (anganwadi)", hi: "रसोई", z: 3, S: [2.4, 3.0], M: [3.0, 3.0], L: [3.0, 3.6], minW: 2.1, wet: 1, win: "kit", fl: "G", furn: "kitchen", fin: "ceramic", door: "D2" }),
    verandah: s({ n: "Verandah", hi: "बरामदा", z: 0, S: [2.0, 6.0], M: [2.4, 8.0], L: [3.0, 10.0], minW: 1.8, open: "park", fl: "G", fin: "kota", win: "none", asp: 6 }),
    meeting: s({ n: "Meeting hall", hi: "बैठक हॉल", z: 1, S: [6, 8], M: [7.2, 10], L: [9, 12], minW: 5.4, win: "hall", circ: 1, fl: "G", furn: "seminar", main: 1, asp: 2.4 }),
    sarpanch: s({ n: "Sarpanch room", hi: "सरपंच कक्ष", z: 2, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "cabin_big" }),
    secretary: s({ n: "Secretary / office", hi: "सचिव / कार्यालय", z: 2, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "office" }),
    exam_r: s({ n: "Examination room", hi: "जाँच कक्ष", z: 2, S: [3.0, 3.6], M: [3.6, 4.2], L: [4.2, 4.8], minW: 2.7, win: "hab", fl: "G", furn: "opd" }),
    staffq: s({ n: "Staff quarter (1 room + kitchen + toilet)", hi: "स्टाफ क्वार्टर", z: 4, S: [3.6, 6.0], M: [4.2, 6.6], L: [4.8, 7.2], minW: 3.3, win: "hab", att: "toilet_att", fl: "G", furn: "bed2" }),
    corridor: s({ n: "Corridor", hi: "गलियारा", z: 2, S: [1.8, 10], M: [2.4, 10], L: [3.0, 10], minW: 1.5, circ: 1, win: "none", asp: 99, auto: 1, corr: 1 })
  };

  /* ---------- helpers for the programmes ---------- */
  function it(key, n, o) { return Object.assign({ key: key, n: n == null ? 1 : n }, o || {}); }
  function ceil(x) { return Math.ceil(x - 1e-9); }
  /* toilet block area from its fittings: WC cubicle 1.5 m², urinal 1.0, wash basin 0.9, then 35 % for the aisle and the entry, at least 4.5 m² */
  PL.blockArea = function (wc, ur, wb) { return Math.max(4.5, Math.round((wc * 1.5 + ur * 1.0 + wb * 0.9) * 1.35 * 10) / 10); };
  /* NBC 2016 Part 9 (indicative): fittings for one floor's users */
  PL.FIX = {
    office: function (m, f) { return { m: { wc: Math.max(1, ceil(m / 25)), ur: m > 6 ? Math.max(1, ceil(m / 25)) : 0, wb: Math.max(1, ceil(m / 25)) }, f: { wc: Math.max(1, ceil(f / 15)), ur: 0, wb: Math.max(1, ceil(f / 25)) } }; },
    school: function (m, f) { return { m: { wc: Math.max(1, ceil(m / 40)), ur: Math.max(1, ceil(m / 20)), wb: Math.max(1, ceil(m / 40)) }, f: { wc: Math.max(1, ceil(f / 25)), ur: 0, wb: Math.max(1, ceil(f / 40)) } }; },
    assembly: function (m, f) { return { m: { wc: Math.max(1, ceil(m / 100)), ur: Math.max(1, ceil(m / 50)), wb: Math.max(1, ceil(m / 100)) }, f: { wc: Math.max(1, ceil(f / 50)), ur: 0, wb: Math.max(1, ceil(f / 100)) } }; },
    hostel: function (m, f) { return { m: { wc: Math.max(1, ceil(m / 8)), ur: Math.max(0, ceil(m / 25)), wb: Math.max(1, ceil(m / 8)), bath: Math.max(1, ceil(m / 8)) }, f: { wc: Math.max(1, ceil(f / 6)), ur: 0, wb: Math.max(1, ceil(f / 8)), bath: Math.max(1, ceil(f / 6)) } }; },
    hospital: function (beds) { var w = Math.max(1, ceil(beds / 8)); return { m: { wc: Math.max(1, ceil(w / 2)), ur: 1, wb: Math.max(1, ceil(w / 2)), bath: Math.max(1, ceil(w / 2)) }, f: { wc: Math.max(1, ceil(w / 2)), ur: 0, wb: Math.max(1, ceil(w / 2)), bath: Math.max(1, ceil(w / 2)) } }; }
  };
  /* a pair of toilet blocks; occ = { k: fittings rule, m: men / boys, f: women / girls } for the whole building — on every floor (perFloor) the users of that floor are counted.
     pwd: an accessible (CWSN) cubicle of 1.8 × 2.2 m inside each block */
  PL.blockFor = function (occ, side, nF) {
    var n = Math.max(1, nF || 1), fx = occ.k === "hospital" ? PL.FIX.hospital(Math.ceil(occ.m / n)) : PL.FIX[occ.k](Math.ceil(occ.m / n), Math.ceil(occ.f / n)), f = fx[side];
    if (occ.pwd) f.pwd = 1; return { fix: f, area: PL.blockArea(f.wc + (f.bath || 0), f.ur, f.wb) + (occ.pwd ? 4.0 : 0) };
  };
  function blocks(list, occ, perFloor, keys, pwd, nF) {
    keys = keys || ["toilet_m", "toilet_f"]; occ.pwd = !!pwd; var n = perFloor ? nF || 1 : 1;
    ["m", "f"].forEach(function (sd, i) { var b = PL.blockFor(occ, sd, n); list.push(it(keys[i], 1, { area: b.area, fix: b.fix, occ: perFloor ? occ : null, side: sd, fl: perFloor ? "all" : "G" })); });
  }
  /* ---------- building types ----------
     mode "band": rooms in two or three rows across the plot (house, canteen, community hall)
     mode "corr": rooms on one or both sides of a corridor with a core of stairs + toilets (office, school, college, hospital, hotel, hostel)
     h = floor-to-floor height (mm); occ = NBC occupant load (m² per person); stairW = least stair width (m); band = room depth beside the corridor; cw = corridor width */
  var T = PL.TYPES = {};
  T.house = { plot: [12, 18], n: "House / bungalow", hi: "घर / बंगला", icon: "🏠", mode: "band", h: 3200, occ: 12.5, stairW: 1.0, grp: "A", rate: 22000, rules: "res",
    inputs: [
      { k: "beds", n: "Bed rooms", hi: "बेडरूम", def: 3, min: 1, max: 8 },
      { k: "attached", n: "Bed rooms with attached toilet", hi: "अटैच्ड टॉयलेट वाले बेडरूम", def: 2, min: 0, max: 8 },
      { k: "persons", n: "Family members", hi: "परिवार के सदस्य", def: 5, min: 1, max: 20 },
      { k: "cars", n: "Car parking (nos.)", hi: "कार पार्किंग", def: 1, min: 0, max: 3 },
      { k: "kitchenOpen", n: "Open kitchen (with dining)", hi: "ओपन किचन", def: 0, bool: 1 }
    ],
    program: function (v) {
      var L = [], beds = Math.max(1, v.beds | 0), att = Math.min(beds, Math.max(0, v.attached | 0));
      if (v.cars > 0) L.push(it("car_park", Math.min(3, v.cars)));
      L.push(it("living")); L.push(it("dining")); L.push(it("kitchen", 1, v.kitchenOpen ? { open_to: "dining" } : null)); L.push(it("store")); L.push(it("utility")); L.push(it("pooja"));
      L.push(it("master")); if (beds >= 2) { if (att >= 2) L.push(it("bed_att", Math.min(beds - 1, att - 1))); var plain = beds - 1 - Math.max(0, Math.min(beds - 1, att - 1)); if (plain > 0) L.push(it("bed", plain)); }
      L.push(it("toilet"));
      if (beds >= 3) { L.push(it("lounge", 1, { fl: "up", opt: 1 })); L.push(it("balcony", 1, { opt: 1 })); }
      L.push(it("stair", 1, { opt: 1 }));
      L.push(it("study", 1, { off: 1 })); L.push(it("guest", 1, { off: 1 })); L.push(it("sitout", 1, { off: 1 })); L.push(it("servant", 1, { off: 1 })); L.push(it("wc", 1, { off: 1 })); L.push(it("bike_park", 1, { off: 1 }));
      return L;
    } };
  T.office = { plot: [25, 30], n: "Office building", hi: "ऑफ़िस बिल्डिंग", icon: "🏢", mode: "corr", h: 3600, occ: 10, stairW: 1.5, band: 6.0, cw: 1.8, grp: "C", rate: 26000, rules: "com", fixk: "office",
    inputs: [
      { k: "staff", n: "Staff (total)", hi: "कर्मचारी", def: 40, min: 2, max: 2000 },
      { k: "female", n: "Women staff %", hi: "महिला %", def: 40, min: 0, max: 100 },
      { k: "cabins", n: "Officer cabins", hi: "केबिन", def: 4, min: 0, max: 100 },
      { k: "ws", n: "Workstations", hi: "वर्कस्टेशन", def: 30, min: 0, max: 2000 },
      { k: "meet", n: "Meeting room seats", hi: "मीटिंग सीट", def: 12, min: 0, max: 200 }
    ],
    program: function (v, fl) {
      var L = [], n = v.staff, f = Math.round(n * v.female / 100), m = n - f, nf = Math.max(1, fl || 1);
      L.push(it("reception")); L.push(it("cabin_head")); if (v.cabins > 0) L.push(it("cabin", v.cabins));
      var ws = v.ws | 0, chunk = 12; while (ws > 0) { var k = Math.min(chunk, ws); L.push(it("openoff", 1, { area: Math.max(24, Math.round(k * 5.5)), seats: k })); ws -= k; }
      if (v.meet > 0) L.push(it("conf", 1, { area: Math.max(15, Math.round(v.meet * 2.2)), seats: v.meet }));
      L.push(it("pantry")); L.push(it("server")); L.push(it("records")); L.push(it("store_g")); L.push(it("security", 1, { opt: 1 })); L.push(it("elec", 1, { opt: 1 }));
      blocks(L, { k: "office", m: m, f: f }, true, null, false, nf); L.push(it("toilet_pwd", 1, { fl: "G" }));
      L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "lift" }));
      return L;
    } };
  T.canteen = { plot: [20, 25], n: "Canteen / mess", hi: "कैंटीन / मेस", icon: "🍽", mode: "band", h: 4000, occ: 1.5, stairW: 1.5, grp: "C", rate: 24000, rules: "com", fixk: "assembly", single: 1,
    inputs: [
      { k: "seats", n: "Seats in the dining hall", hi: "बैठने की सीट", def: 100, min: 10, max: 1000 },
      { k: "veg", n: "Separate non-veg area", hi: "अलग नॉन-वेज क्षेत्र", def: 0, bool: 1 }
    ],
    program: function (v) {
      var L = [], s = v.seats;
      L.push(it("din_hall", 1, { area: Math.max(36, Math.round(s * 1.2)) }));
      L.push(it("serve", 1, { area: Math.max(9, Math.round(s * 0.12)) }));
      L.push(it("ckitchen", 1, { area: Math.max(20, Math.round(s * 0.35)) }));
      if (v.veg) L.push(it("ckitchen", 1, { area: Math.max(12, Math.round(s * 0.15)), name: "Non-veg cooking area" }));
      L.push(it("prep", 1, { area: Math.max(9, Math.round(s * 0.1)) })); L.push(it("dish", 1, { area: Math.max(6, Math.round(s * 0.07)) }));
      L.push(it("dstore", 1, { area: Math.max(6, Math.round(s * 0.06)) })); L.push(it("cstore", 1, { area: Math.max(4, Math.round(s * 0.03)) }));
      L.push(it("handwash", 1, { area: Math.max(3, Math.round(s / 50 * 1.8)) })); L.push(it("manager")); L.push(it("staffchg"));
      blocks(L, { k: "assembly", m: Math.ceil(s * 0.6), f: Math.ceil(s * 0.4) }, false); L.push(it("toilet_pwd", 1, { fl: "G", off: 1 }));
      return L;
    } };
  T.school = { plot: [40, 50], n: "School", hi: "स्कूल", icon: "🏫", mode: "corr", h: 3900, occ: 4, stairW: 1.5, band: 6.0, cw: 2.4, grp: "C", rate: 24000, rules: "inst", fixk: "school", single: 0,
    inputs: [
      { k: "classes", n: "Classes (standards)", hi: "कक्षाएँ", def: 10, min: 1, max: 15 },
      { k: "sections", n: "Sections per class", hi: "सेक्शन प्रति कक्षा", def: 1, min: 1, max: 8 },
      { k: "students", n: "Students per section", hi: "छात्र प्रति सेक्शन", def: 40, min: 10, max: 60 },
      { k: "girls", n: "Girls %", hi: "छात्राएँ %", def: 50, min: 0, max: 100 },
      { k: "senior", n: "Senior secondary (separate Physics / Chemistry / Biology labs)", hi: "उच्चतर माध्यमिक", def: 0, bool: 1 },
      { k: "teachers", n: "Teachers", hi: "शिक्षक", def: 15, min: 1, max: 300 }
    ],
    program: function (v, fl) {
      var L = [], rooms = v.classes * v.sections, st = rooms * v.students, g = Math.round(st * v.girls / 100), b = st - g, nf = Math.max(1, fl || 1);
      L.push(it("classroom", rooms, { area: Math.max(48, v.students * 1.0) }));
      if (v.senior) { L.push(it("phy_lab")); L.push(it("chem_lab")); L.push(it("bio_lab")); } else L.push(it("sci_lab"));
      L.push(it("comp_lab", Math.max(1, Math.ceil(st / 800)))); L.push(it("math_lab")); L.push(it("library"));
      L.push(it("principal")); L.push(it("sch_office")); L.push(it("staffroom", 1, { area: Math.max(20, Math.round(v.teachers * 2.5)) })); L.push(it("sick")); L.push(it("counsel"));
      L.push(it("activity")); L.push(it("artroom", 1, { opt: 1 })); L.push(it("store_g")); L.push(it("mphall", 1, { off: 1 }));
      blocks(L, { k: "school", m: b, f: g }, true, ["toilet_b", "toilet_g"], true, nf); L.push(it("water"));
      L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "lift" }));
      return L;
    } };
  T.college = { plot: [60, 80], n: "College (AICTE norms)", hi: "कॉलेज (AICTE)", icon: "🎓", mode: "corr", h: 3900, occ: 4, stairW: 1.5, band: 7.2, cw: 2.4, grp: "C", rate: 26000, rules: "inst", fixk: "school",
    inputs: [
      { k: "div", n: "Divisions (classes of 60) running at a time", hi: "डिवीजन (60 छात्र)", def: 8, min: 1, max: 80 },
      { k: "depts", n: "Departments", hi: "विभाग", def: 4, min: 1, max: 20 },
      { k: "labs", n: "Laboratories", hi: "प्रयोगशालाएँ", def: 8, min: 0, max: 80 },
      { k: "faculty", n: "Faculty", hi: "शिक्षक", def: 30, min: 1, max: 600 },
      { k: "girls", n: "Girls %", hi: "छात्राएँ %", def: 40, min: 0, max: 100 }
    ],
    program: function (v, fl) {
      var L = [], st = v.div * 60, g = Math.round(st * v.girls / 100), b = st - g, nf = Math.max(1, fl || 1);
      L.push(it("lecture", v.div)); L.push(it("tutorial", Math.max(1, Math.ceil(v.div / 4)))); if (v.labs > 0) L.push(it("lab66", v.labs));
      L.push(it("drawing")); L.push(it("compctr")); L.push(it("seminar")); L.push(it("clibrary"));
      L.push(it("faculty", v.faculty > 6 ? Math.ceil(v.faculty / 2) : v.faculty, { name: v.faculty > 6 ? "Faculty room (2 seats)" : null, area: v.faculty > 6 ? 16 : 10 }));
      L.push(it("hod", v.depts)); L.push(it("deptoff", v.depts)); L.push(it("principal", 1, { area: 30 })); L.push(it("adminoff")); L.push(it("exam")); L.push(it("commonb")); L.push(it("commong"));
      L.push(it("cafeteria", 1, { opt: 1 })); L.push(it("workshop", 1, { off: 1 })); L.push(it("store_g")); L.push(it("sick"));
      blocks(L, { k: "school", m: b, f: g }, true, ["toilet_b", "toilet_g"], true, nf); L.push(it("water"));
      L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "lift" }));
      return L;
    } };
  T.hospital = { plot: [40, 60], n: "Hospital / health centre", hi: "अस्पताल / स्वास्थ्य केंद्र", icon: "🏥", mode: "corr", h: 3900, occ: 15, stairW: 2.0, band: 6.0, cw: 2.4, grp: "C", rate: 32000, rules: "inst",
    inputs: [
      { k: "beds", n: "Beds", hi: "बेड", def: 30, min: 4, max: 300 },
      { k: "opd", n: "OPD consultation rooms", hi: "ओपीडी कक्ष", def: 4, min: 1, max: 40 },
      { k: "ot", n: "Operation theatre", hi: "ऑपरेशन थिएटर", def: 1, bool: 1 },
      { k: "labour", n: "Labour room", hi: "प्रसव कक्ष", def: 1, bool: 1 },
      { k: "priv", n: "Private rooms", hi: "निजी कक्ष", def: 4, min: 0, max: 40 }
    ],
    program: function (v, fl) {
      var L = [], wardBeds = Math.max(0, v.beds - v.priv - 2), nw = Math.ceil(wardBeds / 6), nf = Math.max(1, fl || 1);
      L.push(it("registration")); L.push(it("opd_wait", 1, { area: Math.max(30, v.opd * 12) })); L.push(it("opd", v.opd)); L.push(it("emergency")); L.push(it("pharmacy")); L.push(it("hlab")); L.push(it("xray"));
      if (v.labour) L.push(it("labour")); if (v.ot) { L.push(it("ot")); L.push(it("preop")); L.push(it("cssd")); }
      if (nw) L.push(it("ward", nw, { area: 48, beds: 6 })); if (v.priv) L.push(it("privroom", v.priv)); L.push(it("isolation", 2));
      L.push(it("nurse", 1, { fl: "all" })); L.push(it("duty", 2)); L.push(it("dietary")); L.push(it("laundry")); L.push(it("mstore")); L.push(it("adminoff", 1, { area: 30, name: "Hospital office" }));
      blocks(L, { k: "hospital", m: v.beds, f: v.beds }, true, null, false, nf); L.push(it("toilet_pwd", 1, { fl: "all" }));
      L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "bedlift", name: "Bed lift" }));
      return L;
    } };
  T.hotel = { plot: [30, 40], n: "Hotel / guest house", hi: "होटल / गेस्ट हाउस", icon: "🏨", mode: "corr", h: 3450, occ: 12.5, stairW: 1.5, band: 6.0, cw: 1.8, grp: "C", rate: 30000, rules: "com", fixk: "assembly",
    inputs: [
      { k: "rooms", n: "Guest rooms", hi: "कमरे", def: 20, min: 2, max: 400 },
      { k: "star", n: "Category (1–5 star)", hi: "श्रेणी (स्टार)", def: 3, min: 1, max: 5 },
      { k: "suites", n: "Suites", hi: "सुइट", def: 1, min: 0, max: 40 },
      { k: "covers", n: "Restaurant seats", hi: "रेस्टोरेंट सीट", def: 40, min: 0, max: 600 },
      { k: "banq", n: "Banquet hall seats (0 = none)", hi: "बैंक्वेट सीट", def: 0, min: 0, max: 2000 }
    ],
    program: function (v) {
      var L = [], st = Math.max(1, Math.min(5, v.star | 0)), ra = [11.2, 11.2, 13.0, 14.0, 18.6][st - 1], ba = [2.8, 2.8, 3.3, 3.7, 3.7][st - 1];
      L.push(it("hlobby", 1, { area: Math.max(30, Math.round(v.rooms * 1.0)) })); L.push(it("froom"));
      if (v.covers > 0) { L.push(it("restaurant", 1, { area: Math.max(30, Math.round(v.covers * 1.5)) })); L.push(it("hkitchen", 1, { area: Math.max(20, Math.round(v.covers * 0.6)) })); }
      if (v.banq > 0) L.push(it("banquet", 1, { area: Math.max(60, Math.round(v.banq * 1.2)) }));
      L.push(it("groom", v.rooms - (v.suites | 0), { area: ra + ba, child: ba })); if (v.suites) L.push(it("suite", v.suites, { area: 32 + 5, child: 5 }));
      L.push(it("hk", 1, { fl: "all" })); L.push(it("hstaff")); L.push(it("store_g")); L.push(it("elec", 1, { opt: 1 }));
      blocks(L, { k: "assembly", m: Math.max(10, v.covers), f: Math.max(10, v.covers) }, false); L.push(it("toilet_pwd", 1, { fl: "G" }));
      L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "lift" }));
      return L;
    } };
  T.hostel = { plot: [30, 45], n: "Hostel", hi: "छात्रावास", icon: "🛏", mode: "corr", h: 3300, occ: 12.5, stairW: 1.5, band: 4.8, cw: 1.8, grp: "C", rate: 22000, rules: "inst", fixk: "hostel",
    inputs: [
      { k: "boarders", n: "Boarders", hi: "छात्र", def: 100, min: 4, max: 2000 },
      { k: "per", n: "Beds per room", hi: "बेड प्रति कमरा", def: 2, min: 1, max: 6 },
      { k: "girls", n: "Girls' hostel", hi: "बालिका छात्रावास", def: 0, bool: 1 }
    ],
    program: function (v, fl) {
      var L = [], rooms = Math.ceil(v.boarders / Math.max(1, v.per)), nf = Math.max(1, fl || 1), occ = { k: "hostel", m: v.girls ? 0 : v.boarders, f: v.girls ? v.boarders : 0 }, bb = PL.blockFor(occ, v.girls ? "f" : "m", nf);
      L.push(it("warden")); L.push(it("visitors")); L.push(it("hroom", rooms, { area: Math.max(9.5, 4.5 + v.per * 4.0), beds: v.per }));
      L.push(it("mess", 1, { area: Math.max(30, Math.round(v.boarders * 0.5 * 1.0)) })); L.push(it("ckitchen", 1, { area: Math.max(20, Math.round(v.boarders * 0.2)), name: "Mess kitchen" })); L.push(it("dstore"));
      L.push(it("commonr")); L.push(it("sick")); L.push(it("laundry")); L.push(it("store_g"));
      L.push(it("bath_blk", 1, { area: bb.area, fix: bb.fix, occ: occ, side: v.girls ? "f" : "m", fl: "all", name: (v.girls ? "Girls'" : "Boys'") + " bath & toilet block" }));
      L.push(it("water")); L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "lift" }));
      return L;
    } };
  T.hall = { plot: [30, 40], n: "Community / marriage hall", hi: "सामुदायिक भवन / विवाह हॉल", icon: "🏛", mode: "band", h: 4500, occ: 1.5, stairW: 2.0, grp: "C", rate: 24000, rules: "com", fixk: "assembly", single: 1,
    inputs: [
      { k: "seats", n: "People in the hall", hi: "हॉल में लोग", def: 200, min: 30, max: 2000 },
      { k: "dining", n: "Separate dining hall", hi: "अलग भोजन कक्ष", def: 1, bool: 1 }
    ],
    program: function (v) {
      var L = [], s = v.seats;
      L.push(it("chall", 1, { area: Math.max(80, Math.round(s * 1.0)) })); L.push(it("stage", 1, { area: Math.max(24, Math.round(s * 0.12)) })); L.push(it("green", 2));
      if (v.dining) L.push(it("din_hall", 1, { area: Math.max(40, Math.round(s * 0.5)), main: 0 }));
      L.push(it("hall_kit", 1, { area: Math.max(16, Math.round(s * 0.12)) })); L.push(it("dstore")); L.push(it("store_g"));
      blocks(L, { k: "assembly", m: Math.ceil(s * 0.55), f: Math.ceil(s * 0.45) }, false); L.push(it("toilet_pwd", 1, { fl: "G" }));
      return L;
    } };
  T.apartment = { plot: [30, 40], n: "Apartment / flats", hi: "अपार्टमेंट / फ़्लैट", icon: "🏬", mode: "corr", h: 3000, occ: 12.5, stairW: 1.25, band: 9.0, cw: 1.8, grp: "A", rate: 24000, rules: "res",
    inputs: [
      { k: "flats", n: "Total flats", hi: "कुल फ़्लैट", def: 16, min: 2, max: 400 },
      { k: "bhk", n: "Flat type (bed rooms 1–4)", hi: "फ़्लैट का प्रकार (BHK)", def: 2, min: 1, max: 4 },
      { k: "stilt", n: "Stilt parking on the ground floor", hi: "नीचे स्टिल्ट पार्किंग", def: 1, bool: 1 }
    ],
    program: function (v) {
      var L = [], bhk = Math.max(1, Math.min(4, v.bhk | 0)), area = [0, 48, 72, 98, 125][bhk];
      L.push(it("flobby")); L.push(it("security", 1, { opt: 1 })); L.push(it("elec", 1, { opt: 1 }));
      if (v.stilt) L.push(it("stilt", 1, { area: 40 }));
      L.push(it("flat", v.flats, { area: area, unit: { beds: bhk, attached: Math.max(1, bhk - 1) }, fl: v.stilt ? "up" : "any" }));
      L.push(it("stair", 1, { opt: 1 })); L.push(it("lift", 1, { auto: "lift" }));
      return L;
    } };
  T.shops = { plot: [20, 25], n: "Shops / commercial complex", hi: "दुकानें / कॉम्प्लेक्स", icon: "🏪", mode: "band", h: 3600, occ: 3, stairW: 1.5, grp: "C", rate: 22000, rules: "com", fixk: "office",
    inputs: [
      { k: "shops", n: "Shops on the ground floor", hi: "दुकानें", def: 6, min: 1, max: 60 },
      { k: "halls", n: "Office / showroom halls above", hi: "ऊपर हॉल", def: 2, min: 0, max: 20 }
    ],
    program: function (v) { var L = []; L.push(it("shop", v.shops, { main: 1 })); if (v.halls) L.push(it("showroom", v.halls, { fl: "up" })); L.push(it("store_g"));
      blocks(L, { k: "office", m: Math.ceil(v.shops * 2 + v.halls * 8), f: Math.ceil(v.shops + v.halls * 5) }, false); L.push(it("stair", 1, { opt: 1 })); return L; } };
  T.factory = { plot: [40, 60], n: "Factory / godown", hi: "फ़ैक्ट्री / गोदाम", icon: "🏭", mode: "band", h: 6000, occ: 10, stairW: 1.5, grp: "C", rate: 16000, rules: "ind", single: 1, roof: "gi", fixk: "office",
    inputs: [
      { k: "hall", n: "Production hall area m²", hi: "हॉल क्षेत्रफल", def: 600, min: 50, max: 20000 },
      { k: "godown", n: "Godown area m²", hi: "गोदाम क्षेत्रफल", def: 200, min: 0, max: 20000 },
      { k: "workers", n: "Workers", hi: "मज़दूर", def: 40, min: 2, max: 2000 }
    ],
    program: function (v) { var L = []; L.push(it("prodhall", 1, { area: v.hall })); if (v.godown) L.push(it("godown", 1, { area: v.godown })); L.push(it("loading")); L.push(it("fofice")); L.push(it("security"));
      L.push(it("ckitchen", 1, { area: Math.max(12, Math.round(v.workers * 0.25)), name: "Canteen / rest room" })); blocks(L, { k: "office", m: Math.ceil(v.workers * 0.7), f: Math.ceil(v.workers * 0.3) }, false); return L; } };
  T.anganwadi = { plot: [15, 20], n: "Anganwadi centre", hi: "आंगनबाड़ी केंद्र", icon: "🧒", mode: "band", h: 3300, occ: 4, stairW: 1.0, grp: "C", rate: 20000, rules: "inst", single: 1,
    inputs: [{ k: "kids", n: "Children", hi: "बच्चे", def: 40, min: 10, max: 120 }],
    program: function (v) { var L = []; L.push(it("verandah")); L.push(it("awhall", 1, { area: Math.max(25, Math.round(v.kids * 0.8)) })); L.push(it("awkit")); L.push(it("store")); L.push(it("toilet", 2, { name: "Child-friendly toilet" })); L.push(it("handwash", 1, { area: 3 })); return L; } };
  T.panchayat = { plot: [20, 25], n: "Panchayat bhawan", hi: "पंचायत भवन", icon: "🏛", mode: "band", h: 3600, occ: 1.5, stairW: 1.2, grp: "C", rate: 20000, rules: "inst", single: 1,
    inputs: [{ k: "seats", n: "Meeting hall seats", hi: "बैठक सीट", def: 60, min: 10, max: 300 }],
    program: function (v) { var L = []; L.push(it("verandah")); L.push(it("meeting", 1, { area: Math.max(40, Math.round(v.seats * 1.0)) })); L.push(it("sarpanch")); L.push(it("secretary")); L.push(it("records")); L.push(it("store"));
      blocks(L, { k: "assembly", m: Math.ceil(v.seats * 0.6), f: Math.ceil(v.seats * 0.4) }, false); return L; } };
  T.hwc = { plot: [20, 25], n: "Sub-health centre (HWC)", hi: "उप-स्वास्थ्य केंद्र (HWC)", icon: "⚕", mode: "band", h: 3300, occ: 15, stairW: 1.2, grp: "C", rate: 24000, rules: "inst", single: 1,
    inputs: [{ k: "labour", n: "Labour room", hi: "प्रसव कक्ष", def: 1, bool: 1 }, { k: "qtr", n: "Staff quarter", hi: "स्टाफ क्वार्टर", def: 1, bool: 1 }],
    program: function (v) { var L = []; L.push(it("verandah")); L.push(it("opd_wait", 1, { area: 20, name: "Waiting" })); L.push(it("exam_r", 2)); if (v.labour) L.push(it("labour", 1, { area: 20 })); L.push(it("pharmacy", 1, { area: 9, name: "Medicine store" })); L.push(it("hlab", 1, { area: 9, name: "Lab / sample collection" }));
      L.push(it("toilet", 2)); if (v.qtr) L.push(it("staffq")); return L; } };
  PL.ORDER = ["house", "apartment", "office", "shops", "school", "college", "hospital", "hwc", "hotel", "hostel", "canteen", "hall", "factory", "anganwadi", "panchayat"];

  /* ---------- rules (indicative defaults — always check with the local authority) ---------- */
  PL.RULESETS = {
    mbbl: { n: "Model Building Bye-laws 2016 (indicative)", hi: "मॉडल बिल्डिंग बाय-लॉज़ 2016 (अनुमानित)" },
    cg: { n: "Chhattisgarh Bhumi Vikas Niyam 1984, amended Dec 2024 (Raipur summary — confirm locally)", hi: "छत्तीसगढ़ भूमि विकास नियम 1984 (अनुमानित)" },
    custom: { n: "Custom — type your own", hi: "अपने नियम डालें" }
  };
  /* setbacks front / rear / left / right (m), coverage %, FAR, height (m) by plot area */
  PL.rulesFor = function (set, kind, A) {
    if (kind === "res" && set === "cg") {   /* Chhattisgarh Bhumi Vikas Niyam 1984 (amended Dec 2024) as summarised for Raipur — confirm with the local body */
      if (A <= 90) return { f: 1.5, r: 0, l: 0, rt: 0, cov: 75, far: 1.5, h: 12 };
      if (A <= 250) return { f: 2.0, r: 1.5, l: 1.0, rt: 0, cov: 65, far: 1.5, h: 12 };
      if (A <= 500) return { f: 3.0, r: 2.4, l: 1.5, rt: 1.5, cov: 50, far: 1.25, h: 12.5 };
      return { f: 4.5, r: 3.0, l: 3.0, rt: 3.0, cov: 40, far: 1.25, h: 15 };
    }
    if (kind === "res") {
      if (A <= 100) return { f: 2.0, r: 1.0, l: 0, rt: 0, cov: 75, far: 1.75, h: 12 };
      if (A <= 250) return { f: 3.0, r: 1.5, l: 1.0, rt: 0, cov: set === "cg" ? 60 : 66, far: set === "cg" ? 1.5 : 1.75, h: 12 };
      if (A <= 500) return { f: 4.5, r: 2.0, l: 1.5, rt: 1.5, cov: set === "cg" ? 50 : 55, far: 1.5, h: 15 };
      return { f: 6.0, r: 3.0, l: 3.0, rt: 3.0, cov: 40, far: 1.25, h: 15 };
    }
    if (kind === "ind") return { f: 6.0, r: 3.0, l: 3.0, rt: 3.0, cov: 60, far: 1.5, h: 15 };
    if (kind === "com") { if (A <= 500) return { f: 4.5, r: 3.0, l: 1.5, rt: 1.5, cov: 50, far: 1.5, h: 15 }; return { f: 6.0, r: 3.0, l: 3.0, rt: 3.0, cov: 40, far: 1.5, h: 18 }; }
    if (A <= 2000) return { f: 6.0, r: 3.0, l: 3.0, rt: 3.0, cov: 35, far: 1.0, h: 15 };
    return { f: 9.0, r: 6.0, l: 6.0, rt: 6.0, cov: 30, far: 1.0, h: 18 };
  };
})();
