/* Design Studio — frame2d (port of civilest/design/frame2d.py)
   Linear-elastic 2D frame / truss solver (direct stiffness method, plain JS arrays instead of numpy).

   Units are the caller's choice but must be consistent (this package uses kN, m, kN/m²).

   Elements
       frame  – axial + bending (Euler–Bernoulli), optional moment releases at either end
       truss  – axial only
   Member loads (local axes: x along i→j, y = x rotated +90°) — arrays instead of tuples
       ["udl", wx, wy]                 uniform per unit length
       ["trap", wy_i, wy_j]            linearly varying transverse load
       ["point", a, Px, Py]            point load at distance a from end i
       ["gudl", wX, wY, per]           global-direction uniform load; per = "length" | "projection"
   Sign convention for results: axial N tension +, moment M sagging + (tension on −y side),
   shear V = Σ forces in +y to the left of the section.

   JS API
       new Member(i, j, E, A, I, kind, rel_i, rel_j, name, group)
       new LoadCase(name = "LC")       .nodal {node: [Fx, Fy, M]}, .member {m: [load, …]}
           .add_nodal(n, fx = 0, fy = 0, m = 0), .add_member(m, load), .scaled(f, name = "")
       combine_cases(cases, factors, name)
       new Frame()                     .nodes [[x, y]], .members [Member], .supports {n: [x, y, m]}, .springs {n: [kx, ky, km]}
           .node(x, y) → index
           .member(i, j, E, A, I = 0, kind = "frame", rel_i = false, rel_j = false, name = "", group = "") → index
               (Python keyword args: pass an options object in place of / after the positional ones,
                e.g. f.member(i, j, E, A, I, {name: "Left column", group: "column"}))
           .support(n, x = true, y = true, m = true), .spring(n, kx = 0, ky = 0, km = 0)
           .geom(member) → [L, c, s], .solve(lc) → Result
       Result: .frame, .lc, .u (array), .end_forces ([[6]…]), .loads, .reactions {node: [Rx, Ry, M]}
           .disp(n) → [ux, uy, rz], .axial(m), .diagram(m, npts = 21) → [[x, N, V, M]…],
           .extremes(m, npts = 41) → {M_max, M_min, V_abs, N_max, N_min, M_abs}
*/
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var M = DS.frame2d = {};

  var UNSTABLE = "Structure is unstable (mechanism) – check supports / releases";

  /* ------------------------------------------------------------------ small numpy replacements */
  function zeros(n, m) {
    var r = new Array(n), i, j;
    if (m == null) { for (i = 0; i < n; i++) r[i] = 0; return r; }
    for (i = 0; i < n; i++) { r[i] = new Array(m); for (j = 0; j < m; j++) r[i][j] = 0; }
    return r;
  }
  function transpose(A) {
    var n = A.length, m = n ? A[0].length : 0, T = zeros(m, n);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) T[j][i] = A[i][j];
    return T;
  }
  function matmul(A, B) {            /* matrix × matrix */
    var n = A.length, k = B.length, m = k ? B[0].length : 0, C = zeros(n, m);
    for (var i = 0; i < n; i++) for (var p = 0; p < k; p++) { var a = A[i][p]; if (a === 0) continue; for (var j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
    return C;
  }
  function matvec(A, x) {            /* matrix × vector */
    var n = A.length, r = zeros(n);
    for (var i = 0; i < n; i++) { var s = 0, row = A[i]; for (var j = 0; j < x.length; j++) s += row[j] * x[j]; r[i] = s; }
    return r;
  }
  function sub(A, rows, cols) {      /* A[np.ix_(rows, cols)] */
    return rows.map(function (i) { return cols.map(function (j) { return A[i][j]; }); });
  }
  function take(x, idx) { return idx.map(function (i) { return x[i]; }); }
  /* LU with partial pivoting (as LAPACK getrf); throws "Singular matrix" on an exactly zero pivot */
  function lu(A) {
    var n = A.length, a = A.map(function (r) { return r.slice(); }), piv = [], i, j, k;
    for (k = 0; k < n; k++) {
      var p = k, mx = Math.abs(a[k][k]);
      for (i = k + 1; i < n; i++) { var v = Math.abs(a[i][k]); if (v > mx) { mx = v; p = i; } }
      if (a[p][k] === 0 || !(mx === mx)) throw new Error("Singular matrix");
      piv.push(p);
      if (p !== k) { var t = a[p]; a[p] = a[k]; a[k] = t; }
      var akk = a[k][k], rk = a[k];
      for (i = k + 1; i < n; i++) {
        var ri = a[i], f = ri[k] / akk; ri[k] = f;
        if (f !== 0) for (j = k + 1; j < n; j++) ri[j] -= f * rk[j];
      }
    }
    return { a: a, piv: piv };
  }
  function lu_solve(F, b) {
    var a = F.a, n = a.length, x = b.slice(), i, j;
    for (i = 0; i < n; i++) { var p = F.piv[i]; if (p !== i) { var t = x[p]; x[p] = x[i]; x[i] = t; } }
    for (i = 0; i < n; i++) { var s = x[i]; for (j = 0; j < i; j++) s -= a[i][j] * x[j]; x[i] = s; }
    for (i = n - 1; i >= 0; i--) { var s2 = x[i]; for (j = i + 1; j < n; j++) s2 -= a[i][j] * x[j]; x[i] = s2 / a[i][i]; }
    return x;
  }
  function solve(A, b) { return lu_solve(lu(A), b); }
  function inv(A) {
    var n = A.length, F = lu(A), out = zeros(n, n);
    for (var c = 0; c < n; c++) { var e = zeros(n); e[c] = 1; var col = lu_solve(F, e); for (var r = 0; r < n; r++) out[r][c] = col[r]; }
    return out;
  }
  M._la = { zeros: zeros, transpose: transpose, matmul: matmul, matvec: matvec, sub: sub, take: take, solve: solve, inv: inv };

  function hypot(a, b) { return Math.hypot(a, b); }

  /* ------------------------------------------------------------------ model */
  function Member(i, j, E, A, I, kind, rel_i, rel_j, name, group) {
    this.i = i; this.j = j; this.E = E; this.A = A; this.I = I;
    this.kind = kind == null ? "frame" : kind; this.rel_i = !!rel_i; this.rel_j = !!rel_j;
    this.name = name == null ? "" : name; this.group = group == null ? "" : group;
  }
  M.Member = Member;

  function LoadCase(name, nodal, member) {
    this.name = name == null ? "LC" : name;
    this.nodal = nodal || {};         // node -> [Fx, Fy, M]
    this.member = member || {};       // member -> list of load arrays
  }
  LoadCase.prototype.add_nodal = function (n, fx, fy, m) {
    var a = Object.prototype.hasOwnProperty.call(this.nodal, n) ? this.nodal[n] : [0.0, 0.0, 0.0];
    this.nodal[n] = [a[0] + (fx || 0), a[1] + (fy || 0), a[2] + (m || 0)];
  };
  LoadCase.prototype.add_member = function (m, load) {
    if (!Object.prototype.hasOwnProperty.call(this.member, m)) this.member[m] = [];
    this.member[m].push(load);
  };
  LoadCase.prototype.scaled = function (f, name) {
    var lc = new LoadCase(name || this.name), self = this;
    Object.keys(this.nodal).forEach(function (n) { lc.nodal[n] = self.nodal[n].map(function (x) { return f * x; }); });
    Object.keys(this.member).forEach(function (m) {
      var out = [];
      self.member[m].forEach(function (ld) {
        if (ld[0] === "udl") out.push(["udl", f * ld[1], f * ld[2]]);
        else if (ld[0] === "trap") out.push(["trap", f * ld[1], f * ld[2]]);
        else if (ld[0] === "point") out.push(["point", ld[1], f * ld[2], f * ld[3]]);
        else if (ld[0] === "gudl") out.push(["gudl", f * ld[1], f * ld[2], ld[3]]);
      });
      lc.member[m] = out;
    });
    return lc;
  };
  M.LoadCase = LoadCase;

  M.combine_cases = function (cases, factors, name) {
    var out = new LoadCase(name), n = Math.min(cases.length, factors.length);
    for (var k = 0; k < n; k++) {
      var f = factors[k];
      if (!f) continue;
      var s = cases[k].scaled(f);
      Object.keys(s.nodal).forEach(function (nd) { var v = s.nodal[nd]; out.add_nodal(+nd, v[0], v[1], v[2]); });
      Object.keys(s.member).forEach(function (m) { s.member[m].forEach(function (ld) { out.add_member(+m, ld); }); });
    }
    return out;
  };

  function Frame() {
    this.nodes = [];
    this.members = [];
    this.supports = {};
    this.springs = {};
  }
  /* -------------------------------------------------- model building */
  Frame.prototype.node = function (x, y) {
    for (var k = 0; k < this.nodes.length; k++) {
      var a = this.nodes[k][0], b = this.nodes[k][1];
      if (Math.abs(a - x) < 1e-9 && Math.abs(b - y) < 1e-9) return k;
    }
    this.nodes.push([+x, +y]);
    return this.nodes.length - 1;
  };
  /* member(i, j, E, A, I=0, kind="frame", rel_i=false, rel_j=false, name="", group="")
     — a trailing options object {I, kind, rel_i, rel_j, name, group} replaces Python keyword args */
  Frame.prototype.member = function (i, j, E, A, I, kind, rel_i, rel_j, name, group) {
    var args = [].slice.call(arguments), o = {};
    if (args.length > 4 && args[args.length - 1] && typeof args[args.length - 1] === "object") o = args.pop();
    var keys = ["i", "j", "E", "A", "I", "kind", "rel_i", "rel_j", "name", "group"], p = {};
    keys.forEach(function (k, n) { p[k] = n < args.length ? args[n] : undefined; });
    Object.keys(o).forEach(function (k) { p[k] = o[k]; });
    this.members.push(new Member(p.i, p.j, p.E, p.A, p.I == null ? 0.0 : p.I, p.kind, p.rel_i, p.rel_j, p.name, p.group));
    return this.members.length - 1;
  };
  Frame.prototype.support = function (n, x, y, m) {
    this.supports[n] = [x === undefined ? true : x, y === undefined ? true : y, m === undefined ? true : m];
  };
  Frame.prototype.spring = function (n, kx, ky, km) {
    var a = Object.prototype.hasOwnProperty.call(this.springs, n) ? this.springs[n] : [0.0, 0.0, 0.0];
    this.springs[n] = [a[0] + (kx || 0), a[1] + (ky || 0), a[2] + (km || 0)];
  };

  /* -------------------------------------------------- geometry helpers */
  Frame.prototype.geom = function (m) {
    var p1 = this.nodes[m.i], p2 = this.nodes[m.j];
    var L = hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (L === 0) throw new Error("float division by zero");
    return [L, (p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L];
  };
  Frame._T = function (c, s) {
    var T = zeros(6, 6), R = [[c, s, 0], [-s, c, 0], [0, 0, 1]];
    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) { T[a][b] = R[a][b]; T[a + 3][b + 3] = R[a][b]; }
    return T;
  };
  Frame.prototype._T = Frame._T;
  Frame.prototype._k_local = function (m, L) {
    var E = m.E, A = m.A, I = m.I, k = zeros(6, 6), ea = E * A / L;
    k[0][0] = k[3][3] = ea;
    k[0][3] = k[3][0] = -ea;
    if (m.kind === "truss") return k;
    var ei = E * I;
    k[1][1] = k[4][4] = 12 * ei / Math.pow(L, 3);
    k[1][4] = k[4][1] = -12 * ei / Math.pow(L, 3);
    k[1][2] = k[2][1] = k[1][5] = k[5][1] = 6 * ei / Math.pow(L, 2);
    k[4][2] = k[2][4] = k[4][5] = k[5][4] = -6 * ei / Math.pow(L, 2);
    k[2][2] = k[5][5] = 4 * ei / L;
    k[2][5] = k[5][2] = 2 * ei / L;
    return k;
  };
  Frame.prototype._local_loads = function (m, loads, L, c, s) {
    var out = [];
    loads.forEach(function (ld) {
      if (ld[0] === "gudl") {
        var wX = ld[1], wY = ld[2], per = ld[3];
        var f = per === "projection" && wY ? Math.abs(c) : 1.0;
        var fx = per === "projection" && wX ? Math.abs(s) : 1.0;
        wX = wX * fx; wY = wY * f;
        out.push(["udl", wX * c + wY * s, -wX * s + wY * c]);
      } else out.push(ld);
    });
    return out;
  };
  function addv(f, v) { for (var i = 0; i < 6; i++) f[i] += v[i]; }
  Frame.prototype._fixed_end = function (m, loads, L) {
    var f = zeros(6), L2 = Math.pow(L, 2), L3 = Math.pow(L, 3);
    loads.forEach(function (ld) {
      if (ld[0] === "udl") {
        var wx = ld[1], wy = ld[2];
        addv(f, [-wx * L / 2, -wy * L / 2, -wy * L2 / 12, -wx * L / 2, -wy * L / 2, wy * L2 / 12]);
      } else if (ld[0] === "trap") {
        var w1 = ld[1], w2 = ld[2];
        addv(f, [0, -w1 * L / 2, -w1 * L2 / 12, 0, -w1 * L / 2, w1 * L2 / 12]);
        var q = w2 - w1;
        addv(f, [0, -q * 3 * L / 20, -q * L2 / 30, 0, -q * 7 * L / 20, q * L2 / 20]);
      } else if (ld[0] === "point") {
        var a = ld[1], px = ld[2], py = ld[3], b = L - a;
        addv(f, [-px * b / L, -py * b * b * (3 * a + b) / L3, -py * a * b * b / L2,
          -px * a / L, -py * a * a * (a + 3 * b) / L3, py * a * a * b / L2]);
      }
    });
    if (m.kind === "truss") {
      // transverse load on a truss member goes straight to the nodes (simply supported)
      f[2] = f[5] = 0.0;
      var tot_i = 0.0, tot_j = 0.0;
      loads.forEach(function (ld) {
        if (ld[0] === "udl") { tot_i += -ld[2] * L / 2; tot_j += -ld[2] * L / 2; }
        else if (ld[0] === "trap") { tot_i += -(ld[1] * L / 2 + (ld[2] - ld[1]) * L / 6); tot_j += -(ld[1] * L / 2 + (ld[2] - ld[1]) * L / 3); }
        else if (ld[0] === "point") { tot_i += -ld[3] * (L - ld[1]) / L; tot_j += -ld[3] * ld[1] / L; }
      });
      f[1] = tot_i; f[4] = tot_j;
    }
    return f;
  };
  Frame.prototype._condense = function (m, k, f) {
    var rel = [];
    if (m.kind === "frame") { if (m.rel_i) rel.push(2); if (m.rel_j) rel.push(5); }
    else rel = [2, 5];
    if (!rel.length || m.kind === "truss") {
      if (m.kind === "truss") {
        k = k.map(function (r) { return r.slice(); });
        for (var a = 0; a < 6; a++) { k[2][a] = k[5][a] = 0; k[a][2] = k[a][5] = 0; }
      }
      return [k, f];
    }
    var keep = [0, 1, 2, 3, 4, 5].filter(function (d) { return rel.indexOf(d) < 0; });
    var krr = sub(k, rel, rel), kkr = sub(k, keep, rel);
    var kc = zeros(6, 6), fc = zeros(6);
    var iv = inv(krr);
    var corr = matmul(matmul(kkr, iv), transpose(kkr)), kkk = sub(k, keep, keep);
    keep.forEach(function (r, a) { keep.forEach(function (c, b) { kc[r][c] = kkk[a][b] - corr[a][b]; }); });
    var fcorr = matvec(matmul(kkr, iv), take(f, rel));
    keep.forEach(function (r, a) { fc[r] = f[r] - fcorr[a]; });
    return [kc, fc];
  };
  Frame.prototype._rot_free = function () {
    /* Nodes whose rotation has stiffness (attached to an unreleased frame end). */
    var free = {};
    this.members.forEach(function (m) {
      if (m.kind !== "frame") return;
      if (!m.rel_i) free[m.i] = true;
      if (!m.rel_j) free[m.j] = true;
    });
    return free;
  };

  /* -------------------------------------------------- solve */
  Frame.prototype.solve = function (lc) {
    var self = this, n = this.nodes.length, ndof = 3 * n;
    var K = zeros(ndof, ndof), F = zeros(ndof), cache = [];
    this.members.forEach(function (m, idx) {
      var g = self.geom(m), L = g[0], c = g[1], s = g[2];
      var T = Frame._T(c, s), kl = self._k_local(m, L);
      var loads = self._local_loads(m, Object.prototype.hasOwnProperty.call(lc.member, idx) ? lc.member[idx] : [], L, c, s);
      var fl = self._fixed_end(m, loads, L);
      var kf = self._condense(m, kl, fl); kl = kf[0]; fl = kf[1];
      var Tt = transpose(T), kg = matmul(matmul(Tt, kl), T);
      var dofs = [3 * m.i, 3 * m.i + 1, 3 * m.i + 2, 3 * m.j, 3 * m.j + 1, 3 * m.j + 2];
      for (var a = 0; a < 6; a++) for (var b = 0; b < 6; b++) K[dofs[a]][dofs[b]] += kg[a][b];
      var tf = matvec(Tt, fl);
      for (var a2 = 0; a2 < 6; a2++) F[dofs[a2]] -= tf[a2];
      cache.push([L, c, s, T, kl, fl, loads, dofs]);
    });
    Object.keys(lc.nodal).forEach(function (nd) {
      var v = lc.nodal[nd]; nd = +nd;
      F[3 * nd] += v[0]; F[3 * nd + 1] += v[1]; F[3 * nd + 2] += v[2];
    });
    Object.keys(this.springs).forEach(function (nd) {
      var v = self.springs[nd]; nd = +nd;
      K[3 * nd][3 * nd] += v[0]; K[3 * nd + 1][3 * nd + 1] += v[1]; K[3 * nd + 2][3 * nd + 2] += v[2];
    });
    var fixed = {};
    Object.keys(this.supports).forEach(function (nd) {
      self.supports[nd].forEach(function (flag, k) { if (flag) fixed[3 * (+nd) + k] = true; });
    });
    var rot_free = this._rot_free();
    for (var nd = 0; nd < n; nd++) {
      var spr = Object.prototype.hasOwnProperty.call(this.springs, nd) ? this.springs[nd] : [0, 0, 0];
      if (!rot_free[nd] && spr[2] === 0) fixed[3 * nd + 2] = true;
    }
    var free = [];
    for (var d = 0; d < ndof; d++) if (!fixed[d]) free.push(d);
    var u = zeros(ndof);
    var Kff = sub(K, free, free), uf;
    try { uf = solve(Kff, take(F, free)); }
    catch (exc) { throw new Error(UNSTABLE); }
    free.forEach(function (dd, a) { u[dd] = uf[a]; });
    var umax = 0, finite = true;
    u.forEach(function (x) { if (!isFinite(x)) finite = false; else umax = Math.max(umax, Math.abs(x)); });
    if (!finite || umax > 1e6) throw new Error(UNSTABLE);
    var Ku = matvec(K, u), R = Ku.map(function (x, i) { return x - F[i]; });
    var end_forces = cache.map(function (cc) {
      var T = cc[3], kl = cc[4], fl = cc[5], dofs = cc[7];
      var e = matvec(kl, matvec(T, take(u, dofs)));
      return e.map(function (x, i) { return x + fl[i]; });
    });
    // reactions: support dofs → K u − F ; spring dofs → spring force on structure = −k u
    var reactions = {}, nodesR = {};
    Object.keys(this.supports).concat(Object.keys(this.springs)).forEach(function (k) { nodesR[k] = true; });
    Object.keys(nodesR).forEach(function (k) {
      var nd = +k;
      var sup = Object.prototype.hasOwnProperty.call(self.supports, nd) ? self.supports[nd] : [false, false, false];
      var spr = Object.prototype.hasOwnProperty.call(self.springs, nd) ? self.springs[nd] : [0.0, 0.0, 0.0];
      var r = [];
      for (var q = 0; q < 3; q++) { var dd = 3 * nd + q; r.push(sup[q] ? R[dd] : -spr[q] * u[dd]); }
      reactions[nd] = r;
    });
    return new Result(this, lc, u, end_forces, cache.map(function (cc) { return cc[6]; }), reactions);
  };
  M.Frame = Frame;

  function Result(frame, lc, u, end_forces, loads, reactions) {
    this.frame = frame; this.lc = lc; this.u = u; this.end_forces = end_forces; this.loads = loads; this.reactions = reactions;
  }
  Result.prototype.disp = function (n) { return this.u.slice(3 * n, 3 * n + 3); };
  Result.prototype.axial = function (m) {
    /* Axial force (tension +) at mid-length. */
    return this.diagram(m, 3)[1][1];
  };
  Result.prototype.diagram = function (m, npts) {
    /* [[x, N, V, M]] along member m. */
    if (npts == null) npts = 21;
    var mem = this.frame.members[m], L = this.frame.geom(mem)[0];
    var p = this.end_forces[m], loads = this.loads[m], out = [];
    for (var k = 0; k < npts; k++) {
      var x = L * k / (npts - 1);
      var N = -p[0], V = p[1], Mo = -p[2] + p[1] * x;
      for (var t = 0; t < loads.length; t++) {
        var ld = loads[t];
        if (ld[0] === "udl") {
          var wx = ld[1], wy = ld[2];
          N -= wx * x; V += wy * x; Mo += wy * x * x / 2;
        } else if (ld[0] === "trap") {
          var w1 = ld[1], w2 = ld[2], wxv = w1 + (w2 - w1) * x / L;
          V += (w1 + wxv) / 2 * x;
          Mo += w1 * x * x / 2 + (wxv - w1) * x * x / 6;
        } else if (ld[0] === "point") {
          var a = ld[1], px = ld[2], py = ld[3];
          if (x > a + 1e-12) { N -= px; V += py; Mo += py * (x - a); }
        }
      }
      out.push([x, N, V, Mo]);
    }
    return out;
  };
  Result.prototype.extremes = function (m, npts) {
    var d = this.diagram(m, npts == null ? 41 : npts);
    var Ms = d.map(function (r) { return r[3]; }), Vs = d.map(function (r) { return r[2]; }), Ns = d.map(function (r) { return r[1]; });
    var mx = function (a) { return Math.max.apply(null, a); }, mn = function (a) { return Math.min.apply(null, a); };
    return { M_max: mx(Ms), M_min: mn(Ms), V_abs: mx(Vs.map(Math.abs)), N_max: mx(Ns), N_min: mn(Ns), M_abs: mx(Ms.map(Math.abs)) };
  };
  M.Result = Result;
})();
