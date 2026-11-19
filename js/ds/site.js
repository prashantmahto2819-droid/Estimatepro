/* Design Studio — site condition hooks (DS.site).
   ctx.site = "mine" (SECL coal-mine / nearby area) makes the inputs conservative BEFORE the design runs and adds a
   "Site condition – mining area" section AFTER it. Rules (only ever towards safety):
   * design mode: exposure ≥ Severe, concrete ≥ M30, cover ≥ mine minimum for the member (IS 456 Table 3/5/16);
     check mode: the given grade/cover/exposure are kept (that is what is built) but flagged if below the mine minimum.
   * both modes (site conditions): SBC × 0.8, soil γ ≥ 20, φ ≤ 28°, base friction ≤ 0.45, surcharge ≥ 24 kN/m²,
     imposed load × 1.10 (dynamic / overload allowance), coal-dust 0.25 kN/m² on roofs, wind k1 ≥ 1.07.
   Values come from DS.loadguide.mine_profile / params (see test/ds/site_research.md). */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var COVER = { rcc_slab: 45, rcc_beam: 45, rcc_column: 50, rcc_footing: 50, rcc_staircase: 45, rcc_drain: 50, box_culvert: 50,
    retaining_wall: 50, slab_bridge: 50, tbeam_bridge: 50, water_tank: 45 };
  var EXPO = ["Mild", "Moderate", "Severe", "Very severe", "Extreme"];
  var LL_KEYS = { ll: 1, floor_ll: 1 };
  var STEEL = /^steel_/;

  function P(spec, key, mode) { var p = spec.params.filter(function (x) { return x.key === key; })[0]; return p && p.modes.indexOf(mode) >= 0 ? p : null; }
  function num(v) { var x = +v; return isFinite(x) ? x : null; }
  function r2(x) { return Math.round(x * 100) / 100; }

  /* editable mining-area profile (Design Studio → "Site values"); 0 / blank switches a rule off */
  var DEF = { exposure: "Severe", fck_min: 30, cover_extra: 0, sbc_factor: 0.8, gamma_min: 20, phi_max: 28, mu_max: 0.45,
    surcharge_min: 24, ll_factor: 1.10, dust: 0.25, k1_min: 1.07 };
  var S = DS.site = {
    COVER: COVER,
    DEFAULTS: DEF,
    cfg: Object.assign({}, DEF),
    CFG_FIELDS: [["exposure", "Exposure at least", "", ["Moderate", "Severe", "Very severe", "Extreme"]], ["fck_min", "Concrete grade at least", "N/mm²"],
      ["cover_extra", "Extra cover over the mine minimum", "mm"], ["sbc_factor", "SBC factor (× soil-report SBC)", ""], ["gamma_min", "Soil / fill unit weight at least", "kN/m³"],
      ["phi_max", "Angle of friction at most", "°"], ["mu_max", "Base friction at most", ""], ["surcharge_min", "Surcharge at least", "kN/m²"],
      ["ll_factor", "Imposed-load factor", "×"], ["dust", "Coal-dust load on steel roofs", "kN/m²"], ["k1_min", "Wind k1 at least", ""]],
    setCfg: function (o) { S.cfg = Object.assign({}, DEF); Object.keys(o || {}).forEach(function (k) { if (!(k in DEF)) return; if (k === "exposure") { if (EXPO.indexOf(String(o[k])) >= 0) S.cfg[k] = String(o[k]); return; } var v = +o[k]; if (o[k] !== "" && o[k] != null && isFinite(v) && v >= 0) S.cfg[k] = v; }); },
    changed: function () { return Object.keys(DEF).filter(function (k) { return S.cfg[k] !== DEF[k]; }); },
    isRailway: function (spec, v) { return /culvert/.test(spec.id) && /^Railway/.test(String(v.vehicle || "")); },
    label: function (ctx) { return ctx && ctx.site === "mine" ? "Mining area (SECL – Korba / Gevra)" : "General site"; },

    before: function (spec, inputs, mode, ctx) {
      S.last = []; S.railway = false;
      S.setCfg(ctx && ctx.site_cfg);
      if (!ctx || ctx.site !== "mine") return inputs;
      var K = S.cfg, coverMin = function (id) { return COVER[id] ? COVER[id] + (K.cover_extra || 0) : 0; };
      var C = DS.core, v = C.inputs_with_defaults ? C.inputs_with_defaults(spec, inputs) : inputs, adj = S.last;
      // a railway culvert follows railway rules (IRS / RDSO) only – the mining-area profile is not mixed in
      if (S.isRailway(spec, v)) { S.railway = true; return inputs; }
      function set(key, val, why) {
        var p = P(spec, key, mode); if (!p) return;
        var old = v[key];
        if (p.kind === "select") { var o = p.options.filter(function (x) { return String(x) === String(val); })[0]; if (o === undefined) return; val = o; }
        if (String(old) === String(val)) return;
        v[key] = val; adj.push({ key: key, label: p.label, unit: p.unit || "", from: old, to: val, why: why });
      }
      var design = mode !== "check";
      // ---- durability (design mode only – in check mode we report instead)
      if (design) {
        var pe = P(spec, "exposure", mode);
        if (pe && EXPO.indexOf(String(v.exposure)) < EXPO.indexOf(K.exposure)) set("exposure", K.exposure, "Mine air with coal dust, sulphates and wet/dry cycles → " + K.exposure + " (IS 456 Table 3)");
        var pf = P(spec, "fck", mode);
        if (pf && K.fck_min && num(v.fck) != null && +v.fck < K.fck_min) {
          var opts = (pf.options || []).map(Number).filter(function (x) { return x >= K.fck_min; }).sort(function (a, b) { return a - b; });
          var to = opts.length ? opts[0] : (pf.options ? Math.max.apply(null, pf.options.map(Number)) : K.fck_min);
          if (to > +v.fck) set("fck", to, "Mining area: concrete at least M" + K.fck_min + " (IS 456 Table 5)");
        }
        if (coverMin(spec.id) && P(spec, "cover", mode) && num(v.cover) != null && +v.cover < coverMin(spec.id)) set("cover", coverMin(spec.id), "Nominal cover for severe exposure (IS 456 Table 16)" + (K.cover_extra ? " + " + K.cover_extra + " mm site allowance" : ""));
      }
      // ---- site conditions (both modes)
      if (K.sbc_factor && K.sbc_factor !== 1 && num(v.sbc) != null && P(spec, "sbc", mode)) set("sbc", r2(+v.sbc * K.sbc_factor), K.sbc_factor + " × SBC on mine / reclaimed ground – confirm by soil test (IS 6403, IS 1904)");
      ["gamma", "soil_gamma"].forEach(function (k) { if (K.gamma_min && num(v[k]) != null && +v[k] < K.gamma_min) set(k, K.gamma_min, "OB / mine fill unit weight 18–22 kN/m³ – " + K.gamma_min + " used"); });
      if (K.phi_max && num(v.phi) != null && +v.phi > K.phi_max) set("phi", K.phi_max, "Loose OB / mixed dump φ 25–30° – " + K.phi_max + "° used unless tested");
      ["mu", "mu_soil"].forEach(function (k) { if (K.mu_max && num(v[k]) != null && +v[k] > K.mu_max) set(k, K.mu_max, "Wet / clayey ground: base friction " + K.mu_max); });
      if (K.surcharge_min && num(v.surcharge) != null && +v.surcharge < K.surcharge_min) set("surcharge", K.surcharge_min, "Next to a mine road surcharge ≥ " + K.surcharge_min + " kN/m² (haul road: compute from dumper)");
      Object.keys(LL_KEYS).forEach(function (k) { if (K.ll_factor && K.ll_factor !== 1 && num(v[k]) != null && +v[k] > 0) set(k, r2(+v[k] * K.ll_factor), "Imposed load × " + K.ll_factor + " – mine dynamic / overload allowance (1.25 for vibrating machinery)"); });
      if (K.dust && STEEL.test(spec.id) && num(v.services) != null) set("services", r2(+v.services + K.dust), "Coal-dust deposit on roof +" + K.dust + " kN/m² (0.5 near CHP)");
      if (K.k1_min && num(v.k1) != null && +v.k1 < K.k1_min) set("k1", K.k1_min, "Wind risk coefficient for important mine structures (IS 875-3 Table 1)");
      return v;
    },

    after: function (spec, res, mode, ctx) {
      if (!res || !res.calc) return;
      if (!ctx || ctx.site !== "mine") { res.site_adjust = []; return; }
      var C = DS.core, c = res.calc, adj = S.last || [], v = res.inputs || {};
      res.site_adjust = adj.slice();
      var chg = S.changed();
      if (chg.length && !S.railway) { c.section("Site condition – mining area"); c.info("Site values changed by the user", chg.map(function (k) { return k + " = " + S.cfg[k] + " (default " + DEF[k] + ")"; }).join("; "), "Site values"); }
      if (S.railway) {
        c.section("Site condition");
        c.info("Railway culvert", "Railway rules govern (IRS Bridge Rules / IRS CBC / RDSO); the mining-area profile is not applied to railway structures", "Railway");
        res.summary["Site"] = "Railway – railway rules only";
        return;
      }
      c.section("Site condition – mining area");
      c.info("Site", "Mining area (SECL) – conservative values applied (General site uses your inputs as given)", "Site profile");
      adj.forEach(function (a) { c.info("Input made conservative – " + a.label, C.pystr(a.from) + " → " + C.pystr(a.to) + (a.unit ? " " + a.unit : "") + " · " + a.why, "Mine profile"); });
      var has = function (re) { return c.steps.some(function (s) { return re.test(s.label); }); };
      if (mode === "check") {
        if (v.exposure != null && EXPO.indexOf(String(v.exposure)) < 2) c.warn("Exposure for mining area", String(v.exposure) + " given – Severe or Very severe expected near mines", "IS 456 Table 3");
        if (num(v.fck) != null && +v.fck < 30 && P(spec, "fck", mode) && !has(/^Mining site: concrete/)) c.warn("Concrete grade for mining area", "M" + v.fck + " given – M30 minimum for severe exposure", "IS 456 Table 5");
        if (COVER[spec.id] && num(v.cover) != null && +v.cover < COVER[spec.id] && !has(/^Mining site: cover/)) c.warn("Cover for mining area", v.cover + " mm given – " + COVER[spec.id] + " mm minimum for severe exposure", "IS 456 Table 16");
      }
      var id = spec.id;
      c.miss("Blast vibration: peak particle velocity at this structure within DGMS Circular 7 of 1997 limits (industrial RCC 10/20/25 mm/s for <8 / 8–25 / >25 Hz).", "DGMS (Tech)(S&T) Circular 7/1997", "Important");
      c.miss("Ground: confirm no underground workings / angle of draw below the site (CMPDI / SECL plan); never found on OB dumps < 5 years old.", "DGMS / Mine practice", "Important");
      c.miss("Soil and mine-water test for sulphate (SO₃) and pH → IS 456 Table 4 class; Class 3+ → SRC / slag cement + bitumen coating.", "IS 456 Table 4, cl 8.2.2", "Important");
      if (/culvert/.test(id) && !/^Mine dumper/.test(String(v.vehicle || ""))) c.miss("Road culvert in a mining area: if dumpers cross it, choose location “Mine haul road” and the actual dumper class – IRC 70R is far lighter than a 100 t dumper axle.", "Mine practice / IRC 6", "Critical");
      if (STEEL.test(id)) c.miss("Steel in mine atmosphere: blast Sa 2½ + zinc-rich epoxy 75 µm + MIO epoxy 2×100 µm + PU 50 µm (or HDG 85 µm).", "IS 800 cl 15 / ISO 12944 C4–C5", "Important");
      if (id === "retaining_wall" || id === "rcc_drain") c.miss("Keep dumper / tipper wheels ≥ 1.5 m from the wall top with a safety bund.", "Mine practice", "Important");
      if (id === "water_tank" || id === "box_culvert") c.miss("Check uplift (FoS ≥ 1.2) with groundwater at ground level in the monsoon.", "IS 3370 / practice", "Important");
      res.summary["Site"] = "Mining area – " + adj.length + " input(s) made conservative";
    }
  };
})();
