/* Estimate Pro — departments. The app is built department-ready: each department chooses its rate books,
   suggested-item groups and tabs. Civil is complete; E&M is in beta (market library); PHE and Horticulture
   reuse Civil books for now. To add a department: add an entry here (books, groups, tabs) and its data files. */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {};
  EP.DEPTS = [
    { id: "civil", short: "Civil", name: "Civil", hi: "सिविल", status: "active", books: null, groups: function (g) { return g !== "em"; }, tabs: null,
      blurb: "CPWD DSOR 2023 / DSR 2021, MPPWD Road SOR, Horticulture, Design Studio, market items." },
    { id: "em", short: "E&M", name: "Electrical & Mechanical (E&M)", hi: "विद्युत एवं यांत्रिक", status: "beta", books: null, groups: function (g) { return g === "em" || g === "market"; }, tabs: null,
      blurb: "Internal / external electrification, DG & solar, HVAC, fire fighting, lifts & pumps — market library (beta). E&M SOR upload via My SORs." },
    { id: "phe", short: "PHE", name: "Public Health (PHE)", hi: "जन स्वास्थ्य", status: "planned", books: null, groups: function (g) { return g === "svc" || g === "drain" || g === "market"; }, tabs: null,
      blurb: "Water supply, sewerage, drainage — uses CPWD chapters 17–19 and the plumbing / sewerage categories today." },
    { id: "hort", short: "Horticulture", name: "Horticulture", hi: "उद्यानिकी", status: "planned", books: null, groups: function (g) { return g === "land" || g === "market"; }, tabs: null,
      blurb: "DSR Horticulture 2018, garden & landscape categories, outdoor market items." }
  ];
  EP.dept = function () { var id = "civil"; try { id = localStorage.getItem("ep_dept") || "civil"; } catch (e) {} return EP.DEPTS.filter(function (d) { return d.id === id; })[0] || EP.DEPTS[0]; };
  EP.setDept = function (id) { try { localStorage.setItem("ep_dept", id); } catch (e) {} };
})();
