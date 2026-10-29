// v4B-NEAR-2A — one stipple form per section. Every scene poses the same point pool
// (index → position/colour/size), so the stage can morph any scene into the next.
// Film references: 01 Agents (sphere + hopping agents), 02 Chains (iso cubes routed into
// one account), 03 Speed (planes + traffic), 04 Privacy (enclave shell, scrambled core),
// 05 NEAR (logo stipple resolving solid).
import {
  Cam, K, PALETTE, accent, cl, eInOut, eOutExpo, grainK, guideBox, hash, inkOf, lerp, shade, sm,
  type Env, type O, type Pt, type Scene,
} from './film';

const TAU = Math.PI * 2;
const v3 = [0, 0, 0];

/** an agent hopping around a sphere on its own great circle (film scene 01) */
function agent(cam: Cam, p: Pt, t: number, r: number, o: O) {
  let n0 = p.r1 - 0.5, n1 = p.r2 - 0.5, n2 = p.r3 - 0.5;
  const nl = Math.hypot(n0, n1, n2) || 1;
  n0 /= nl; n1 /= nl; n2 /= nl;
  let u0 = n1, u1 = -n0;
  const ul = Math.hypot(u0, u1) || 1;
  u0 /= ul; u1 /= ul;
  const w0 = n1 * 0 - n2 * u1, w1 = n2 * u0 - n0 * 0, w2 = n0 * u1 - n1 * u0;
  const hop = t / 0.42, k = Math.floor(hop);
  const a = p.r4 * 6.28 + 0.42 * (k + eInOut(cl((hop - k) / 0.45)));
  const ca = Math.cos(a), sa = Math.sin(a);
  cam.proj((u0 * ca + w0 * sa) * r, (u1 * ca + w1 * sa) * r, w2 * sa * r, o);
}

/** enclave: 12 crisp edges, sparse faces, a scrambled core on a 9³ lattice (film scene 04) */
const EDG = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
function enclave(cam: Cam, q: number, nShell: number, rk: number, p: Pt, e: Env, o: O, gk: number, TH: number, build: number, tick: number) {
  const nEdge = Math.floor(nShell * 0.5), per = Math.floor((nShell - nEdge) / 6);
  const sc = TH * eOutExpo(cl((build - p.r1 * 0.3) / 0.9));
  if (q < nEdge) {
    const ed = q % 12, tt = Math.floor(q / 12) / Math.max(1, Math.floor(nEdge / 12) - 1);
    const a = EDG[ed][0], b = EDG[ed][1];
    const x = lerp(a & 1 ? 1 : -1, b & 1 ? 1 : -1, tt), y = lerp(a & 2 ? 1 : -1, b & 2 ? 1 : -1, tt), z = lerp(a & 4 ? 1 : -1, b & 4 ? 1 : -1, tt);
    cam.proj(x * sc, y * sc, z * sc, o);
    const dk = e.dark(o.y);
    o.c = dk ? (p.r7 < 0.55 ? K.MINT : K.D + 9 + Math.round(o.d * 6)) : o.d > 0.42 ? K.INK : K.L + 7 + Math.round(o.d * 8);
    o.a = 0.5 + 0.5 * o.d;
    o.s = (1.5 + 1.3 * o.d) * gk * o.f * (p.r5 > 0.93 ? 1.8 : 1);
    o.h = 0;
    return;
  }
  q -= nEdge;
  if (q < per * 6) {
    const f = (q / per) | 0, idx = q % per;
    const g = Math.max(3, Math.floor(Math.sqrt(per)));
    if (idx >= g * g) { o.a = 0; o.s = 0; cam.proj(0, 0, 0, o); return; }
    const u = (((idx % g) + 0.5) / g * 2 - 1) * 0.94, v = ((((idx / g) | 0) + 0.5) / g * 2 - 1) * 0.94;
    const ax = f >> 1, sg = f & 1 ? -1 : 1;
    v3[ax] = sg; v3[(ax + 1) % 3] = u; v3[(ax + 2) % 3] = v;
    cam.proj(v3[0] * sc, v3[1] * sc, v3[2] * sc, o);
    shade(p, o, e, 0, gk);
    o.a *= 0.5;
    o.s *= 0.8;
    return;
  }
  const h = hash(rk * 13.7 + tick * 0.91), L = (h * 729) | 0;
  const gx = (L % 9) / 8 * 2 - 1, gy = (((L / 9) | 0) % 9) / 8 * 2 - 1, gz = ((L / 81) | 0) / 8 * 2 - 1;
  const si = TH * 0.66 * eOutExpo(cl((build - 0.4) / 0.8));
  cam.proj(gx * si, gy * si, gz * si, o);
  const on = hash(rk * 3.1 + tick * 1.7) > 0.72;
  o.c = accent(e, o.y);
  o.a = on ? 0.5 + 0.5 * o.d : 0;
  o.s = on ? (2 + p.r5 * 2.5) * gk : 0;
  o.h = 0;
}

/* =====================================================================================
   00 HERO — "Open Markets, Private Money": an open sphere of points (the network) with a
   sealed enclave at its core; agents hop around the outside.
   ===================================================================================== */
const hero: Scene = (() => {
  const cam = new Cam();
  const AG = 24;
  let gk = 1, nS = 0, nC = 0, tick = 0;
  return {
    dust: true,
    extent: 0.4,
    prepare(e) {
      const r = e.rects[0];
      const s = Math.min(r.w, r.h) / 2 / 1.7;
      cam.set(r.cx, r.cy, s, 0.5 + e.t * 0.12, -0.32);
      gk = grainK(s);
      nS = Math.floor((e.M - AG) * 0.58);
      nC = Math.floor((e.M - AG) * 0.27);
      tick = Math.floor(e.t / 0.11);
    },
    pose(rk, p, e, o) {
      const age = e.age;
      if (rk < AG) {
        const r = 1.36 * eOutExpo(cl((age - 0.7 - p.r5 * 0.4) / 0.8));
        agent(cam, p, e.t, r, o);
        o.c = rk % 3 === 0 ? (e.dark(o.y) ? K.BONE : K.DEEP) : accent(e, o.y);
        o.a = cl((age - 0.7 - p.r5 * 0.4) / 0.2);
        o.h = rk % 5 === 4 ? 1 : 0;
        o.s = (7 + p.r6 * 4) * gk;
        return;
      }
      let q = rk - AG;
      if (q < nS) {
        const y = 1 - 2 * (q + 0.5) / nS, rr = Math.sqrt(1 - y * y), th = q * 2.399963;
        const ap = age - 0.15 - p.r1 * 0.55;
        const rf = 1.25 * eOutExpo(cl(ap / 1.1)) * (1 + (p.r6 - 0.5) * 0.07);
        cam.proj(Math.cos(th) * rr * rf, y * rf, Math.sin(th) * rr * rf, o);
        shade(p, o, e, 0.55, gk);
        o.a *= 0.8 * cl(ap / 0.3);
        return;
      }
      q -= nS;
      enclave(cam, q, nC, rk, p, e, o, gk, 0.52, age - 0.7, tick);
    },
    overlay(g, e, w) {
      const r = e.rects[0];
      const hw = Math.min(r.w, r.h) * 0.4;
      guideBox(g, r.cx, r.cy, hw, hw, eOutExpo(cl((e.age - 0.2) / 0.9)), 0.28 * w * cl((e.age - 0.15) / 0.3), PALETTE[K.WARM]);
    },
  };
})();

/* =====================================================================================
   01 SHIFT — film 02 "Chains": six isometric rails (payments, collateral, settlement …)
   route into one dense cube. Scroll scrubs the film's local time.
   ===================================================================================== */
const shift: Scene = (() => {
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = (b: number, out: number[]) => { out[0] = b & 1 ? 1 : -1; out[1] = b & 2 ? 1 : -1; out[2] = b & 4 ? 1 : -1; };
  const CUBES = [[1210, 320], [1560, 320], [1080, 550], [1690, 550], [1210, 780], [1560, 780]];
  const CC = [1385, 550], CA = 80, CCA = 78, SCL = 1.15;
  const ROUTES = [
    [[1210, 400], [1210, 440], [1335, 505]], [[1560, 400], [1560, 440], [1435, 505]], [[1149, 550], [1317, 550]],
    [[1621, 550], [1453, 550]], [[1210, 700], [1210, 660], [1335, 595]], [[1560, 700], [1560, 660], [1435, 595]],
  ];
  const PK: { r: number; st: number }[] = [];
  ROUTES.forEach((_, r) => { for (let n = 0; n < 3; n++) PK.push({ r, st: 1.45 + r * 0.07 + n * 0.35 }); });
  const polyLen = (pts: number[][]) => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };
  const LENS = ROUTES.map(polyLen);
  const along = (pts: number[][], d: number, out: number[]) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l || k === pts.length - 1) { const u = l ? cl(d / l) : 0; out[0] = lerp(a[0], b[0], u); out[1] = lerp(a[1], b[1], u); return; }
      d -= l;
    }
  };
  let k = 1, ox = 0, oy = 0, lt = 0, gk = 1, t = 0;
  const A = [0, 0, 0], B = [0, 0, 0], Q = [0, 0];
  // film coords → slot, through the film's 1.15 scale around the account cube
  const put = (fx: number, fy: number, o: O) => { o.x = ox + (CC[0] + (fx - CC[0]) * SCL - CC[0]) * k; o.y = oy + (CC[1] + (fy - CC[1]) * SCL - CC[1]) * k; };
  const iso = (px: number, py: number, x: number, y: number, z: number, o: O) => put(px + (x - z) * 0.866, py + (x + z) * 0.5 - y, o);
  const pulseAt = () => {
    let v = 0;
    for (const q of PK) { const ta = q.st + 0.55; if (lt >= ta) v = Math.max(v, Math.exp(-(lt - ta) * 6)); }
    if (lt > 2.6) for (let r = 0; r < 6; r++) { const ph = (t * 0.55 + r * 0.17) % 1; v = Math.max(v, Math.exp(-ph * 9) * 0.8); }
    return v;
  };
  let lit = 0;
  return {
    extent: 0.5,
    prepare(e) {
      const r = e.rects[0];
      k = Math.min(r.w / 900, r.h / 720);
      ox = r.cx; oy = r.cy; t = e.t;
      lt = e.reduce ? 3.4 : 0.75 + e.P.shift * 2.6;
      gk = k * 0.95;
      lit = pulseAt();
    },
    pose(rk, p, e, o) {
      o.h = 0; o.d = 0.7; o.nx = 0; o.f = 1;
      const dk = e.dark(oy);
      if (rk < 1800) {
        const c = (rk / 300) | 0, j = rk % 300, px = CUBES[c][0], py = CUBES[c][1], h = CA / 2, hs = hash(rk * 7.3);
        const ap = cl((lt - 0.45 - c * 0.06 - (j / 300) * 0.35) / 0.35);
        if (j < 108) {
          const ed = (j / 9) | 0, tt = (j % 9) / 8;
          corner(EDGES[ed][0], A); corner(EDGES[ed][1], B);
          iso(px, py, lerp(A[0], B[0], tt) * h, lerp(A[1], B[1], tt) * h, lerp(A[2], B[2], tt) * h, o);
          const back = (v: number[]) => v[0] < 0 && v[1] < 0 && v[2] < 0;
          const hidden = back(A) || back(B), right = A[0] > 0 && B[0] > 0, cn = j % 9 === 0 || j % 9 === 8;
          if (cn) { o.c = dk ? K.BONE : K.INK; o.s = 7; o.a = hidden ? 0.25 : 0.9; }
          else { o.c = right ? (dk ? K.MINT : K.GREEN) : dk ? K.BONE : K.INK; o.s = 3; o.a = hidden ? 0.18 : right ? 0.95 : 0.55; }
        } else {
          const qq = j - 108, f = (qq / 64) | 0, idx = qq % 64, col = idx % 8, row = (idx / 8) | 0;
          const u = ((col + 0.5) / 8 * 2 - 1) * 0.9, v = ((row + 0.5) / 8 * 2 - 1) * 0.9;
          if (f === 0) { iso(px, py, u * h, h, v * h, o); o.c = dk ? K.ASH : K.PALE; o.s = 2 + hs * 1.5; o.a = hs < 0.4 ? 0 : 0.65; }
          else if (f === 1) { iso(px, py, h, v * h, u * h, o); o.c = hs < 0.55 ? (dk ? K.MINT : K.GREEN) : K.DEEP; o.s = 2.4 + hs * 2.6; o.a = hs < 0.15 ? 0 : 0.85; }
          else {
            iso(px, py, u * h, v * h, h, o);
            if (row === 5 && col >= 1 && col <= 4) { o.c = dk ? K.BONE : K.INK; o.s = 6; o.a = 1; }
            else { o.c = hs < 0.6 ? K.WARM : dk ? K.ASH : K.PALE; o.s = 2 + hs * 2; o.a = hs < 0.3 ? 0 : 0.7; }
          }
        }
        o.a *= ap;
        o.s *= (0.4 + 0.6 * ap) * gk;
        return;
      }
      const cj = rk - 1800;
      if (cj < 243) {
        const f = (cj / 81) | 0, idx = cj % 81, u = ((idx % 9) + 0.5) / 9 * 2 - 1, v = (((idx / 9) | 0) + 0.5) / 9 * 2 - 1, h = CCA / 2, hs = hash(rk * 3.7);
        let base: number;
        if (f === 0) { iso(CC[0], CC[1], u * h, h, v * h, o); base = K.GPAPER; }
        else if (f === 1) { iso(CC[0], CC[1], h, v * h, u * h, o); base = dk ? K.MINT : K.GREEN; }
        else { iso(CC[0], CC[1], u * h, v * h, h, o); base = K.DEEP; }
        const ap = cl((lt - 0.8 - ((v + 1) / 2) * 0.5 - hs * 0.2) / 0.3);
        o.c = hs < 0.18 && lt < 2.4 ? K.PALE : lit * 0.6 > hs ? (dk ? K.MINT : K.GREEN) : base;
        o.s = (6.2 + lit * 1.6) * (0.3 + 0.7 * ap) * gk;
        o.a = ap;
        return;
      }
      // the rest wait inside the account cube, unseen
      put(CC[0] + (hash(rk) - 0.5) * 100, CC[1] + (hash(rk + 3) - 0.5) * 100, o);
      o.c = K.GREEN; o.s = 2; o.a = 0;
    },
    overlay(g, e, w) {
      const al = w * cl((lt - 0.4) / 0.3);
      if (al <= 0.01) return;
      const dk = e.dark(oy);
      // iso construction lines through every cube (film)
      const pr = eOutExpo(cl((lt - 0.4) / 0.9));
      g.save();
      g.strokeStyle = PALETTE[dk ? K.BONE : K.WARM];
      g.lineWidth = 1;
      g.globalAlpha = 0.18 * al;
      g.beginPath();
      for (const [x0, y0] of [...CUBES, CC]) {
        const x = ox + (x0 - CC[0]) * SCL * k, y = oy + (y0 - CC[1]) * SCL * k, a = 260 * pr * k, v = 170 * pr * k;
        g.moveTo(x - 0.866 * a, y - 0.5 * a); g.lineTo(x + 0.866 * a, y + 0.5 * a);
        g.moveTo(x - 0.866 * a, y + 0.5 * a); g.lineTo(x + 0.866 * a, y - 0.5 * a);
        g.moveTo(x, y - v); g.lineTo(x, y + v);
      }
      g.stroke();
      // dotted routes
      g.fillStyle = PALETTE[dk ? K.MINT : K.GREEN];
      const ds = 5 * k * SCL;
      ROUTES.forEach((rt, r) => {
        const gr = eOutExpo(cl((lt - 0.6 - r * 0.08) / 0.8));
        g.globalAlpha = 0.85 * al;
        for (let d = 8; d < LENS[r] * gr; d += 15) {
          along(rt, d, Q);
          const qx = ox + (Q[0] - CC[0]) * SCL * k, qy = oy + (Q[1] - CC[1]) * SCL * k;
          g.fillRect(qx - ds / 2, qy - ds / 2, ds, ds);
        }
      });
      // packets: scrubbed by scroll, then a continuous loop once the routes are drawn
      const ps = 11 * k * SCL;
      const packet = (r: number, u: number) => {
        along(ROUTES[r], eInOut(u) * LENS[r], Q);
        const qx = ox + (Q[0] - CC[0]) * SCL * k, qy = oy + (Q[1] - CC[1]) * SCL * k;
        g.globalAlpha = al;
        g.fillStyle = PALETTE[dk ? K.MINT : K.GREEN];
        g.fillRect(qx - ps / 2, qy - ps / 2, ps, ps);
        g.fillStyle = PALETTE[dk ? K.BONE : K.INK];
        g.fillRect(qx - ps * 0.14, qy - ps * 0.14, ps * 0.28, ps * 0.28);
      };
      for (const q of PK) { const u = (lt - q.st) / 0.55; if (u >= 0 && u < 1) packet(q.r, u); }
      if (lt > 2.6 && !e.reduce) for (let r = 0; r < 6; r++) packet(r, (t * 0.55 + r * 0.17) % 1);
      g.restore();
    },
  };
})();

/* =====================================================================================
   02 STATS (night) — film 03 "Speed": one plane per figure, traffic streaming through.
   The plane of the figure in view seals, like the film's block every 600 ms.
   ===================================================================================== */
const stats: Scene = (() => {
  const cam = new Cam();
  const PX = [-0.75, -0.25, 0.25, 0.75];
  const G = 18, PER = G * G;
  let gk = 1, flash = 0;
  return {
    dust: true,
    extent: 0.5,
    prepare(e) {
      const r = e.rects[0];
      const s = Math.min(r.w / 3.2, r.h / 2.4);
      cam.set(r.cx, r.cy, s, -0.5 + Math.sin(e.t * 0.18) * 0.12, -0.22);
      gk = grainK(s);
      const ph = (((e.t - 0.2) % 0.6) + 0.6) % 0.6;
      flash = e.reduce ? 0.6 : Math.max(0, 1 - ph / 0.3);
    },
    pose(rk, p, e, o) {
      const age = e.age;
      if (rk < PER * 4) {
        const k = (rk / PER) | 0, idx = rk % PER;
        const y = (idx % G) / (G - 1) * 1.6 - 0.8, z = ((idx / G) | 0) / (G - 1) * 1.1 - 0.55;
        const sc = eOutExpo(cl((age - 0.1 - k * 0.12 - p.r1 * 0.3) / 0.8));
        cam.proj(PX[k], y * sc, z * sc, o);
        shade(p, o, e, 0, gk);
        o.s = Math.max(1.8 * gk, o.s * 1.1);
        o.a = Math.min(1, o.a + 0.25);
        if (k === e.P.stat) {
          if (0.45 + 0.55 * flash > p.r7) o.c = accent(e, o.y);
          o.a = Math.max(o.a, 0.6 + 0.4 * flash);
          o.s *= 1.35;
        } else if (e.P.stat >= 0) o.a *= 0.7;
        return;
      }
      const v = 1.0 + p.r1 * 1.8;
      const x = ((p.r2 * 3.2 + v * e.t) % 3.2 + 3.2) % 3.2 - 1.6, y = (p.r3 - 0.5) * 1.3, z = (p.r4 - 0.5) * 1.3;
      cam.proj(x, y, z, o);
      shade(p, o, e, 0, gk);
      o.a *= 0.22 * cl((age - 0.3) / 0.6);
      o.s *= 0.7;
      if (p.r6 < 0.25) {
        let near = 1;
        for (const px of PX) near = Math.min(near, Math.abs(x - px));
        if (near < 0.06) { o.c = accent(e, o.y); o.a = cl((age - 0.3) / 0.6); o.s = 3.5 * gk; }
      }
    },
    overlay(g, e, w) {
      const r = e.rects[0];
      const pr = eOutExpo(cl((e.age - 0.2) / 0.9));
      guideBox(g, r.cx, r.cy, r.w * 0.44, r.h * 0.4, pr, 0.16 * w * cl((e.age - 0.15) / 0.3), PALETTE[K.BONE]);
    },
  };
})();

/* =====================================================================================
   03 FORMAT — "One stage in the capital of capital": a stipple city grid (avenues and
   blocks with floor lines); the centre block is a single green plate with a light column.
   ===================================================================================== */
const format: Scene = (() => {
  const cam = new Cam();
  const NX = 7, NZ = 5, PITCH = 0.34, BS = 0.25, Y0 = -0.42;
  const CXI = 3, CZI = 2;
  const blocks: { x: number; z: number; h: number; d: number }[] = [];
  for (let iz = 0; iz < NZ; iz++)
    for (let ix = 0; ix < NX; ix++) {
      if (ix === CXI && iz === CZI) continue;
      const hs = hash(ix * 7.1 + iz * 13.3);
      let h = 0.1 + 0.5 * hs * hs;
      if ((ix === 1 && iz === 1) || (ix === 5 && iz === 3)) h = 1.0 + hs * 0.15; // two landmark towers
      else if ((ix === 5 && iz === 1) || (ix === 2 && iz === 3)) h = 0.7;
      blocks.push({ x: (ix - (NX - 1) / 2) * PITCH, z: (iz - (NZ - 1) / 2) * PITCH, h, d: Math.hypot(ix - CXI, iz - CZI) / 4 });
    }
  // points per tower ∝ its surface: cumulative weights
  const W: number[] = [];
  let tot = 0;
  for (const b of blocks) { tot += b.h * 4 + BS; W.push(tot); }
  const pick = (u: number) => { const x = u * tot; let lo = 0, hi = W.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (W[m] < x) lo = m + 1; else hi = m; } return lo; };
  let gk = 1, nPlate = 0, nBeam = 0, nStreet = 0, nT = 0, g = 0;
  return {
    dust: true,
    extent: 0.5,
    prepare(e) {
      const r = e.rects[0];
      const s = Math.min(r.w / 2.9, r.h / 2.25);
      cam.set(r.cx, r.cy + s * 0.08, s, 0.62 + Math.sin(e.t * 0.06) * 0.22, -0.6);
      gk = grainK(s);
      nPlate = Math.floor(e.M * 0.07);
      nBeam = Math.floor(e.M * 0.04);
      nStreet = Math.floor(e.M * 0.13);
      nT = e.M - nPlate - nBeam - nStreet;
      g = Math.floor(Math.sqrt(nPlate));
    },
    pose(rk, p, e, o) {
      const age = e.age;
      if (rk < nT) {
        const b = blocks[pick((rk + 0.5) / nT)];
        const rise = eOutExpo(cl((age - 0.15 - b.d * 0.5 - p.r1 * 0.2) / 1.1));
        const h = b.h * rise, hb = BS / 2;
        const sel = p.r3, e4 = (p.r4 * 4) | 0;
        let x: number, y: number, z: number, edge = false;
        if (sel < 0.44) {
          x = e4 & 1 ? hb : -hb; z = e4 & 2 ? hb : -hb; y = Y0 + p.r6 * h; edge = true;
        } else if (sel < 0.84) {
          const u = (p.r6 * 2 - 1) * hb;
          const fl = Math.max(0.035, h / Math.max(1, Math.round(h / 0.045)));
          y = Y0 + Math.min(h, (Math.floor((p.r5 * h) / fl) + 0.5) * fl);
          if (e4 === 0) { x = hb; z = u; } else if (e4 === 1) { x = -hb; z = u; } else if (e4 === 2) { z = hb; x = u; } else { z = -hb; x = u; }
        } else {
          x = (p.r4 - 0.5) * BS; z = (p.r6 - 0.5) * BS; y = Y0 + h; edge = sel > 0.96;
        }
        cam.proj(b.x + x, y, b.z + z, o);
        shade(p, o, e, 0, gk);
        if (edge) { o.s *= 1.25; o.a = Math.min(1, o.a + 0.18); if (o.d > 0.45) o.c = Math.min(K.L + 15, o.c + 2); }
        o.a *= cl((age - 0.1 - b.d * 0.4) / 0.4);
        return;
      }
      let q = rk - nT;
      if (q < nPlate) {
        const u = ((q % g) + 0.5) / g - 0.5, v = (((q / g) | 0) + 0.5) / g - 0.5;
        const sc = eOutExpo(cl((age - 0.5 - p.r1 * 0.3) / 0.8));
        cam.proj(u * BS * 0.96 * sc, Y0, v * BS * 0.96 * sc, o);
        o.c = o.d > 0.5 ? accent(e, o.y) : K.DEEP;
        o.a = 0.95 * sc;
        o.s = 2.4 * gk * o.f;
        o.h = 0;
        return;
      }
      q -= nPlate;
      if (q < nBeam) {
        const hh = (p.r1 + e.t * 0.12) % 1;
        cam.proj((p.r2 - 0.5) * BS * 0.7, Y0 + hh * 1.25, (p.r3 - 0.5) * BS * 0.7, o);
        o.c = accent(e, o.y);
        o.a = (1 - hh) * 0.7 * cl((age - 1.0) / 0.6);
        o.s = 1.6 * gk;
        o.h = 0;
        return;
      }
      // streets: dotted avenues and cross streets on the ground plane
      const lines = NX + NZ + 2;
      const li = (p.r1 * lines) | 0, along = (p.r2 - 0.5) * 2;
      const ex = (NX * PITCH) / 2, ez = (NZ * PITCH) / 2;
      if (li <= NX) cam.proj((li - NX / 2) * PITCH, Y0, along * ez, o);
      else cam.proj(along * ex, Y0, (li - NX - 1 - NZ / 2) * PITCH, o);
      o.c = e.dark(o.y) ? K.D + 6 : K.L + 5;
      o.a = 0.45 * cl((age - 0.1 - Math.abs(along) * 0.4) / 0.5);
      o.s = 1.2 * gk;
      o.h = 0;
    },
    overlay(g2, e, w) {
      const r = e.rects[0];
      guideBox(g2, r.cx, r.cy, r.w * 0.44, r.h * 0.42, eOutExpo(cl((e.age - 0.2) / 0.9)), 0.26 * w * cl((e.age - 0.15) / 0.3), PALETTE[K.WARM]);
    },
  };
})();

/* =====================================================================================
   04 AGENDA — four tracks, four forms (the pool split by rank % 4):
   0 a ring of circulating value · 1 stacked market plates · 2 a sealed enclave · 3 agents
   ===================================================================================== */
const agenda: Scene = (() => {
  const cams = [new Cam(), new Cam(), new Cam(), new Cam()];
  const gks = [1, 1, 1, 1];
  let nq = 0, tick = 0;
  return {
    prepare(e) {
      for (let i = 0; i < 4; i++) {
        const r = e.rects[i] ?? e.rects[0];
        const s = Math.min(r.w, r.h) / 2 / 1.12;
        cams[i].set(r.cx, r.cy, s, 0.4 + e.t * 0.22 + i * 0.9, i === 1 ? -0.42 : -0.36);
        gks[i] = grainK(s) * 1.15;
      }
      nq = e.M >> 2;
      tick = Math.floor(e.t / 0.11);
    },
    pose(rk, p, e, o) {
      const sub = rk & 3, q = rk >> 2, cam = cams[sub], gk = gks[sub], age = e.age - sub * 0.12;
      const ap = cl((age - p.r1 * 0.5) / 0.5);
      if (sub === 0) {
        if (q < 10) {
          // value in motion along the ring
          const b = e.t * 0.7 + q * 0.628;
          cam.proj(Math.cos(b) * 0.92, 0, Math.sin(b) * 0.92, o);
          o.c = q % 3 === 0 ? K.DEEP : accent(e, o.y); o.a = ap; o.s = (5 + (q % 3)) * gk; o.h = q % 4 === 3 ? 1 : 0;
          return;
        }
        const b = (q / nq) * TAU, a = q * 2.399963, R = 0.92 * eOutExpo(ap), m = 0.22;
        cam.proj((R + m * Math.cos(a)) * Math.cos(b), m * Math.sin(a), (R + m * Math.cos(a)) * Math.sin(b), o);
        shade(p, o, e, 0.35, gk);
        o.a *= ap;
        return;
      }
      if (sub === 1) {
        const per = Math.floor(nq / 5), gg = Math.max(3, Math.floor(Math.sqrt(per)));
        const pl = Math.min(4, (q / per) | 0), idx = q % per;
        if (idx >= gg * gg) { cam.proj(0, 0, 0, o); o.a = 0; return; }
        const u = (idx % gg) / (gg - 1) * 2 - 1, v = ((idx / gg) | 0) / (gg - 1) * 2 - 1;
        const y = (pl - 2) * 0.3 * eOutExpo(cl((age - 0.2) / 0.8));
        cam.proj(u * 0.72, y, v * 0.72, o);
        shade(p, o, e, 0, gk);
        const hot = e.reduce ? 4 : Math.floor(e.t * 0.9) % 5;
        if (pl === hot && (Math.abs(u) === 1 || Math.abs(v) === 1 || p.r7 < 0.5)) o.c = o.d > 0.5 ? accent(e, o.y) : K.DEEP;
        if (Math.abs(u) === 1 || Math.abs(v) === 1) o.a = Math.min(1, o.a + 0.2);
        o.a *= ap;
        return;
      }
      if (sub === 2) {
        enclave(cam, q, Math.floor(nq * 0.72), rk, p, e, o, gk, 0.72, age, tick);
        return;
      }
      const AG = 14;
      if (q < AG) {
        agent(cam, p, e.t, 1.18 * eOutExpo(cl((age - 0.4) / 0.8)), o);
        o.c = q % 3 === 0 ? K.DEEP : accent(e, o.y); o.a = cl((age - 0.4) / 0.3); o.h = q % 5 === 4 ? 1 : 0; o.s = (6 + p.r6 * 3) * gk;
        return;
      }
      const n = nq - AG, qq = q - AG;
      const y = 1 - 2 * (qq + 0.5) / n, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = qq * 2.399963, rf = 0.82 * eOutExpo(ap);
      cam.proj(Math.cos(th) * rr * rf, y * rf, Math.sin(th) * rr * rf, o);
      shade(p, o, e, 0.5, gk);
      o.a *= ap;
    },
    overlay(g, e, w) {
      const al = 0.32 * w * cl((e.age - 0.1) / 0.4);
      if (al <= 0.01) return;
      g.save();
      g.strokeStyle = PALETTE[K.WARM];
      g.globalAlpha = al;
      g.lineWidth = 1;
      g.beginPath();
      for (const r of e.rects) {
        for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
          g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5);
        }
      }
      g.stroke();
      g.restore();
    },
  };
})();

/* =====================================================================================
   05 AUDIENCE — "Who's in the Room": seven raked rows of seats around one stage; a row
   lights as its line of the list passes.
   ===================================================================================== */
const audience: Scene = (() => {
  const cam = new Cam();
  const ROWS = 7, SPAN = Math.PI * 0.64;
  const RAD = (i: number) => 0.46 + i * 0.12;
  const wsum = Array.from({ length: ROWS }, (_, i) => RAD(i)).reduce((a, b) => a + b, 0);
  let gk = 1, nStage = 0, nSeat = 0;
  return {
    dust: true,
    extent: 0.5,
    prepare(e) {
      const r = e.rects[0];
      const s = Math.min(r.w / 2.6, r.h / 1.55);
      cam.set(r.cx, r.cy + s * 0.12, s, Math.sin(e.t * 0.14) * 0.22, -0.78);
      gk = grainK(s);
      nStage = Math.floor(e.M * 0.06);
      nSeat = e.M - nStage;
    },
    pose(rk, p, e, o) {
      const age = e.age;
      if (rk < nSeat) {
        // row by cumulative radius
        let u = ((rk + 0.5) / nSeat) * wsum, row = 0;
        while (row < ROWS - 1 && u > RAD(row)) { u -= RAD(row); row++; }
        const R = RAD(row), seats = Math.round(R * 34);
        const si = Math.floor(p.r1 * seats);
        const th = -SPAN + ((si + 0.5) / seats) * SPAN * 2 + (p.r2 - 0.5) * 0.012;
        const rr = R + (p.r3 - 0.5) * 0.035;
        const ap = cl((age - 0.1 - row * 0.08 - p.r4 * 0.3) / 0.6);
        cam.proj(Math.sin(th) * rr, -0.42 + row * 0.07 + p.r6 * 0.03, -Math.cos(th) * rr + 0.32, o);
        shade(p, o, e, 0, gk);
        if (row < e.P.aud) { if (p.r7 < 0.75) o.c = o.d > 0.5 ? accent(e, o.y) : K.DEEP; o.a = Math.min(1, o.a + 0.15); }
        o.a *= ap;
        return;
      }
      const q = rk - nSeat, g = Math.floor(Math.sqrt(nStage));
      const u = ((q % g) + 0.5) / g - 0.5, v = (((q / g) | 0) + 0.5) / g - 0.5;
      cam.proj(u * 0.42, -0.45, v * 0.3 + 0.32, o);
      o.c = o.d > 0.45 ? inkOf(e, o.y) : K.WARM;
      o.a = 0.9 * cl((age - 0.4) / 0.5);
      o.s = 2 * gk;
      o.h = 0;
    },
    overlay(g, e, w) {
      const r = e.rects[0];
      guideBox(g, r.cx, r.cy, r.w * 0.45, r.h * 0.42, eOutExpo(cl((e.age - 0.2) / 0.9)), 0.24 * w * cl((e.age - 0.15) / 0.3), PALETTE[K.WARM], 36);
    },
  };
})();

/* =====================================================================================
   06 SPEAKERS — "to be announced": four stipple busts, identities sealed by a band of
   scrambling green squares across the eyes (the film's privacy scramble).
   ===================================================================================== */
const speakers: Scene = (() => {
  const cams = [new Cam(), new Cam(), new Cam(), new Cam()];
  const gks = [1, 1, 1, 1];
  const VAR = [0, 1, 2, 3].map((i) => ({ hr: 0.28 + hash(i * 3.3) * 0.05, sw: 0.62 + hash(i * 5.1) * 0.12, hy: 0.4 + hash(i * 7.7) * 0.05 }));
  let nq = 0, tick = 0;
  return {
    prepare(e) {
      for (let i = 0; i < 4; i++) {
        const r = e.rects[i] ?? e.rects[0];
        const s = Math.min(r.w / 1.75, r.h / 1.95);
        cams[i].set(r.cx, r.y + r.h - 0.86 * s, s, Math.sin(e.t * 0.3 + i * 1.3) * 0.42 + (i - 1.5) * 0.15, -0.1);
        gks[i] = grainK(s) * 1.3;
      }
      nq = e.M >> 2;
      tick = Math.floor(e.t / 0.11);
    },
    pose(rk, p, e, o) {
      const sub = rk & 3, q = rk >> 2, cam = cams[sub], gk = gks[sub], V = VAR[sub];
      const age = e.age - sub * 0.1;
      const ap = cl((age - p.r1 * 0.6) / 0.5);
      const f = q / nq;
      let x: number, y: number, z: number;
      if (f < 0.4) {
        // head: a slightly tall sphere
        const n = Math.floor(nq * 0.4), qq = q;
        const yy = 1 - 2 * (qq + 0.5) / n, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = qq * 2.399963;
        x = Math.cos(th) * rr * V.hr; y = V.hy + yy * V.hr * 1.14; z = Math.sin(th) * rr * V.hr * 1.02;
        // the seal: eye band, front half
        if (Math.abs(y - (V.hy + 0.02)) < 0.06 && z > -0.05) {
          const jt = hash(rk * 5.3 + tick * 0.7);
          const yq = V.hy + 0.02 + (Math.floor(hash(rk * 1.7) * 4) - 1.5) * 0.03;
          cam.proj((jt - 0.5) * V.hr * 2.2, yq, V.hr * 1.08, o);
          const on = hash(rk * 2.1 + tick * 1.3) > 0.2;
          o.c = jt > 0.25 ? accent(e, o.y) : K.DEEP;
          o.a = on ? ap : 0;
          o.s = (3 + p.r5 * 2.6) * gk;
          o.h = 0;
          return;
        }
      } else if (f < 0.47) {
        const th = p.r2 * TAU;
        x = Math.cos(th) * 0.11; z = Math.sin(th) * 0.1; y = 0.02 + p.r3 * (V.hy - V.hr - 0.0);
      } else {
        // shoulders and chest: a rounded yoke from the neck, a slight taper to the waist
        const th = p.r2 * TAU, yy = 0.06 - Math.pow(p.r3, 0.8) * 0.92;
        const k = sm(0.07, -0.26, yy);
        const wv = 0.13 + (V.sw - 0.13) * Math.sqrt(k) * (1 - 0.1 * sm(-0.4, -0.86, yy));
        const ct = Math.cos(th), st = Math.sin(th);
        // squarer cross-section (superellipse) so shoulders read
        const sx = Math.sign(ct) * Math.pow(Math.abs(ct), 0.7), sz = Math.sign(st) * Math.pow(Math.abs(st), 0.7);
        x = sx * wv; z = sz * wv * 0.42; y = yy - Math.abs(sx) * k * 0.06; // shoulders slope
      }
      cam.proj(x, y, z, o);
      shade(p, o, e, 0, gk);
      o.a = Math.min(1, o.a + 0.12) * ap;
    },
  };
})();

/* =====================================================================================
   07 CLOSING (night) — film 04 "Privacy": a hardware enclave, crisp shell, scrambled core.
   ===================================================================================== */
const closing: Scene = (() => {
  const cam = new Cam();
  let gk = 1, tick = 0, nShell = 0;
  return {
    dust: true,
    extent: 0.5,
    prepare(e) {
      const r = e.rects[0];
      const s = Math.min(r.w, r.h) / 2 / 1.12;
      cam.set(r.cx, r.cy, s, 0.4 + e.t * 0.3, -0.5);
      gk = grainK(s);
      tick = Math.floor(e.t / 0.11);
      nShell = Math.min(1700, Math.floor(e.M * 0.5));
    },
    pose(rk, p, e, o) {
      enclave(cam, rk, nShell, rk, p, e, o, gk, 0.62, e.age, tick);
    },
    overlay(g, e, w) {
      const r = e.rects[0];
      const hw = Math.min(r.w, r.h) * 0.44;
      guideBox(g, r.cx, r.cy, hw, hw, eOutExpo(cl((e.age - 0.2) / 0.9)), 0.16 * w * cl((e.age - 0.15) / 0.3), PALETTE[K.BONE]);
    },
  };
})();

/* =====================================================================================
   08 FOOTER — film 05 "NEAR": every point lands in the logo, a green sweep runs through,
   then the stipple resolves into the solid logo (the DOM svg fades in via --solid).
   ===================================================================================== */
const footer: Scene = (() => {
  let rx = 0, ry = 0, rw = 1, rh = 1, sweep = -1, sz = 2;
  return {
    prepare(e) {
      const r = e.rects[0];
      rx = r.x; ry = r.y; rw = r.w; rh = r.h;
      sweep = lerp(-0.2, 1.2, eInOut(cl((e.age - 0.9) / 1.0)));
      const L = e.P.logo;
      sz = L ? Math.max(1.1, (rw / 1060) * L.step) : 2;
    },
    pose(rk, p, e, o) {
      const L = e.P.logo;
      o.d = 0.85; o.nx = 0; o.f = 1; o.h = 0;
      const solid = e.reduce ? 1 : eInOut(cl((e.age - 2.1) / 0.6));
      if (L && rk < L.n) {
        const u = L.u[rk], v = L.v[rk];
        o.x = rx + u * rw; o.y = ry + v * rh;
        const hit = Math.abs(u - sweep) < 0.06;
        o.c = hit ? K.GREEN : L.mark[rk] ? K.GREEN : p.r6 < 0.12 ? K.WARM : K.BONE;
        o.a = (hit ? 1 : 0.92) * (1 - solid);
        o.s = (hit ? 0.62 : 0.3 + p.r5 * 0.26) * sz;
        return;
      }
      o.x = rx + p.r1 * rw; o.y = ry + p.r2 * rh; o.c = K.BONE; o.a = 0; o.s = 1;
    },
  };
})();

export const SCENES: Record<string, Scene> = { hero, shift, stats, format, agenda, audience, speakers, closing, footer };
