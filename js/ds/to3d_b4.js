/* Estimate Pro — Design Studio → 3D builders, batch 4: mine_gumti (portable shelter / gumti). All sizes in mm, ground z = 0, centre of the
   cabin at the origin, x along the length (door on the −y face near the +x corner), y across. Windows: back, left, right, then front. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {}, T = DS.to3d; if (!T || !T.reg) return;
  function num(x, d) { x = +x; return isFinite(x) ? x : d; }
  T.reg("mine_gumti", function (v, res, H) {
    var s = String, L = num(v.L, 2) * 1000, W = num(v.W, 2) * 1000, Hm = num(v.H, 2.8) * 1000, P = [], roof = s(v.roof || "Pyramid"), pyr = /Pyramid/.test(roof), dbl = !pyr && !/only$/.test(roof);
    var sk = /ISMC 75/.test(s(v.frame || "ISMC 75")) ? 75 : 100, post = /72×72/.test(s(v.frame)) ? 72 : /50×50/.test(s(v.frame)) ? 50 : 40, z0 = v.x_pedestal ? 450 : 0, zf = z0 + sk, zt = z0 + Hm, t = 60;
    var rise = pyr ? num(v.rise, 0.8) * 1000 : 0, ov = pyr ? 300 : 0, yellow = /yellow/.test(s(v.paint)), wl = yellow ? "paint_peach" : "paint_white", dW = /800/.test(s(v.door)) ? 800 : 750, ww = num(v.win_w, 1.2) * 1000, wh = 600, sill = 1100;
    var nWin = Math.max(0, Math.round(num(v.windows, 3))), apex = /apex/.test(s(v.hook || "")), dx0 = L / 2 - 150 - dW, dx1 = L / 2 - 150;
    if (v.x_pedestal) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { P.push(H.box(q[0] * (L / 2 - 225), q[1] * (W / 2 - 225), 450, 450, 0, 450, "concrete")); });
    /* base: three cross runners under, frame ring, floor */
    [-1, 0, 1].forEach(function (k) { P.push(H.box(k * (L / 2 - 150), 0, 150, W, z0, zf, "steel_member")); });
    P.push(H.box(0, 0, L, W, zf, zf + 40, "steel_member"));
    /* a wall face along x (y = yc) or along y (x = xc) with rectangular holes [a0, a1, z0, z1] (along-wall coordinates) */
    var face = function (alongX, c, a0, a1, holes) {
      var cuts = [a0].concat(holes.reduce(function (r, h) { return r.concat([h[0], h[1]]); }, [])).concat([a1]), mk = function (u0, u1, za, zb) { if (u1 - u0 < 1 || zb - za < 1) return; P.push(alongX ? H.bx(u0, c - t / 2, u1, c + t / 2, za, zb, wl) : H.bx(c - t / 2, u0, c + t / 2, u1, za, zb, wl)); };
      for (var i = 0; i + 1 < cuts.length; i += 2) mk(cuts[i], cuts[i + 1], zf, zt);
      holes.forEach(function (h) { mk(h[0], h[1], zf, h[2]); mk(h[0], h[1], h[3], zt); });
    };
    var win = function (alongX, c, u0, sg) { var u1 = u0 + ww, zs = zf + sill, ze = zs + wh; P.push(alongX ? H.bx(u0, c - 8, u1, c + 8, zs, ze, "glass_tint") : H.bx(c - 8, u0, c + 8, u1, zs, ze, "glass_tint"));
      P.push(alongX ? H.bx((u0 + u1) / 2 - 15, c - 20, (u0 + u1) / 2 + 15, c + 20, zs, ze, "aluminium") : H.bx(c - 20, (u0 + u1) / 2 - 15, c + 20, (u0 + u1) / 2 + 15, zs, ze, "aluminium"));
      for (var g = 1; g < 8; g++) { var u = u0 + g * ww / 8; P.push(alongX ? H.box(u, c + sg * 45, 12, 12, zs, ze, "steel_member") : H.box(c + sg * 45, u, 12, 12, zs, ze, "steel_member")); }
      if (v.x_canopy) P.push(alongX ? H.bx(u0 - 150, c + (sg > 0 ? 0 : -500), u1 + 150, c + (sg > 0 ? 500 : 0), ze + 150, ze + 190, "sheet_gi") : H.bx(c + (sg > 0 ? 0 : -500), u0 - 150, c + (sg > 0 ? 500 : 0), u1 + 150, ze + 150, ze + 190, "sheet_gi")); };
    var has = function (k) { return nWin > k; }, zS = zf + sill, zE = zS + wh;
    face(true, W / 2 - t / 2, -L / 2, L / 2, has(0) ? [[-ww / 2, ww / 2, zS, zE]] : []); if (has(0)) win(true, W / 2 - t / 2, -ww / 2, 1);
    face(false, -L / 2 + t / 2, -W / 2 + t, W / 2 - t, has(1) ? [[-ww / 2, ww / 2, zS, zE]] : []); if (has(1)) win(false, -L / 2 + t / 2, -ww / 2, -1);
    face(false, L / 2 - t / 2, -W / 2 + t, W / 2 - t, has(2) ? [[-ww / 2, ww / 2, zS, zE]] : []); if (has(2)) win(false, L / 2 - t / 2, -ww / 2, 1);
    var fh = [[dx0, dx1, zf, zf + 2060]]; if (has(3)) fh.unshift([-L / 2 + 150, -L / 2 + 150 + ww, zS, zE]); face(true, -W / 2 + t / 2, -L / 2, L / 2, fh); if (has(3)) win(true, -W / 2 + t / 2, -L / 2 + 150, -1);
    /* door, corner posts */
    P.push(H.bx(dx0, -W / 2 - 10, dx1, -W / 2 + 30, zf + 60, zf + 2060, "steel"), H.box(dx0 + 90, -W / 2 - 30, 20, 120, zf + 1000, zf + 1030, "chrome"));
    if (v.x_canopy) P.push(H.bx(dx0 - 200, -W / 2 - 600, dx1 + 200, -W / 2, zf + 2250, zf + 2290, "sheet_gi"));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { P.push(H.box(q[0] * (L / 2 - post / 2), q[1] * (W / 2 - post / 2), post + 4, post + 4, zf, zt, "steel_member")); });
    P.push(H.bx(-L / 2, -W / 2, L / 2, W / 2, zt - 10, zt + 40, "steel_member"));
    /* roof */
    var lookR = /yellow/.test(s(v.paint)) || !/white/.test(s(v.paint)) ? "sheet_red" : "paint_white";
    if (pyr) { var a = [-L / 2 - ov, -W / 2 - ov, zt], b = [L / 2 + ov, -W / 2 - ov, zt], c = [L / 2 + ov, W / 2 + ov, zt], d = [-L / 2 - ov, W / 2 + ov, zt], ap = [0, 0, zt + rise + ov * rise / (Math.min(L, W) / 2)];
      [[a, b], [b, c], [c, d], [d, a]].forEach(function (e) { P.push(H.quad(e[0], e[1], ap, ap, lookR)); });
      [a, b, c, d].forEach(function (q) { P.push(H.member([q[0] * 0.95, q[1] * 0.95, zt + 20], [0, 0, ap[2] - 40], 40, 40, "steel_member", 0)); });
      if (apex) P.push(H.box(0, 0, 16, 120, ap[2] - 20, ap[2] + 140, "steel_member"), H.cyl(0, 0, 60, ap[2] + 60, ap[2] + 100, "steel_member")); }
    else { P.push(H.bx(-L / 2 - 30, -W / 2 - 30, L / 2 + 30, W / 2 + 30, zt, zt + 60, "paint_white"));
      if (dbl) { [-1, 0, 1].forEach(function (k) { [-1, 1].forEach(function (sg) { P.push(H.box(k * (L / 2 - 200), sg * (W / 2 - 200), 40, 40, zt + 60, zt + 210 + (sg > 0 ? 0 : 40), "steel_member")); }); });
        P.push(H.quad([-L / 2 - 300, -W / 2 - 300, zt + 255], [L / 2 + 300, -W / 2 - 300, zt + 255], [L / 2 + 300, W / 2 + 300, zt + 210], [-L / 2 - 300, W / 2 + 300, zt + 210], "sheet_gi")); } }
    if (!apex) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { var x = q[0] * (L / 2 + 40), y = q[1] * (W / 2 - post / 2); P.push(H.box(x, y, 90, 12, zt - 160, zt + 10, "steel_member"), H.cyl(x + q[0] * 10, y, 45, zt - 100, zt - 60, "steel_member")); });
    /* inside: bench, table / chairs, lights, AC, water cooler */
    var sb = s(v.seat || "");
    if (/bench/.test(sb)) { P.push(H.bx(-L / 2 + t, W / 2 - t - 400, L / 2 - t, W / 2 - t, zf + 400, zf + 450, "wood_light"), H.bx(-L / 2 + t, W / 2 - t - 400, L / 2 - t, W / 2 - t - 380, zf + 40, zf + 400, "wood_light"));
      if (/two walls/.test(sb)) P.push(H.bx(-L / 2 + t, -W / 2 + t + 300, -L / 2 + t + 400, W / 2 - t - 400, zf + 400, zf + 450, "wood_light")); }
    if (/table/.test(sb)) P.push(H.box(L / 2 - t - 350, 0, 450, 600, zf + 700, zf + 730, "wood_light"));
    if (/chairs/.test(sb)) [-300, 300].forEach(function (x) { P.push(H.box(x, W / 2 - t - 350, 450, 450, zf + 420, zf + 450, "upvc")); });
    var nL = Math.max(0, Math.round(num(v.lights, 2))); for (var i = 0; i < nL; i++) P.push(H.box(nL > 1 ? -L / 4 + i * L / 2 / (nL - 1) : 0, 0, 1200, 60, zt - 60, zt - 30, "paint_white"));
    if (v.x_ac) P.push(H.box(-L / 2 + t + 110, 0, 200, 800, zt - 450, zt - 150, "paint_white"), H.box(-L / 2 - 300, W / 4, 260, 700, zf + 300, zf + 850, "paint_grey"));
    if (v.x_solar) P.push(H.member([-L / 2, -W / 2 - ov, zt + 80], [L / 2, -W / 2 - ov, zt + 80], 40, 40, "steel_member", 0), H.quad([-L / 2, -W / 2 - ov - 20, zt + 120], [L / 2, -W / 2 - ov - 20, zt + 120], [L / 2, -W / 4, zt + (pyr ? rise * 0.6 : 150) + 120], [-L / 2, -W / 4, zt + (pyr ? rise * 0.6 : 150) + 120], "glass_tint"));
    if (v.x_water) P.push(H.box(L / 2 - t - 200, W / 2 - t - 650, 320, 320, zf, zf + 1050, "paint_white"), H.cyl(L / 2 - t - 200, W / 2 - t - 650, 130, zf + 1050, zf + 1450, "glass"));
    return { name: "Gumti / portable shelter " + (L / 1000) + " × " + (W / 1000) + " m" + (pyr ? ", pyramid roof" : ""), parts: P };
  });
})();
