// v4B-NEARCON 2D (A6) ASCII fields (forked from 2A; only the hero changes).
//  - Hero (2D): "open network, sealed payload". A composed 3D network turns on black; messages run its
//    public routes. Public values are legible (digits, + - . , %); sealed payloads are churning cipher
//    blocks. Scroll dives the camera into one node, the enclave, where all traffic is cipher.
//    Drawn on the CPU straight into the glyph grid. No pointer interaction. ~30 fps, paused off-screen.
//  - Shift: a public candlestick tape scrolling left; one band of it is sealed, so whatever
//    crosses it densifies into an encrypted glyph block. 15 fps, no WebGL.
//  - Sky: a procedural NYC skyline silhouette in density characters that rises with scroll.
import * as THREE from 'three';

export const RAMP = ' .:-+=<>/*;01()[]{}';
const SCR = '01{}[]<>/*;()=+';
const FRAME = 1000 / 30;

let charRatio = 0.6;
export function measureCharRatio(family = 'Roboto Mono') {
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return charRatio;
    c.font = `400 100px "${family}", ui-monospace, monospace`;
    const w = c.measureText('0000000000').width / 1000;
    if (w > 0.4 && w < 0.8) charRatio = w;
  } catch {
    /* keep default */
  }
  return charRatio;
}

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

export type Field = {
  pause: (p: boolean) => void;
  resize: () => void;
  render: () => void;
  setReveal: (v: number) => void;
  setGrow?: (v: number) => void;
  dispose: () => void;
};

/* ------------------------------------------------------------------ */
/* Visibility-gated, throttled loop shared by both fields              */
/* ------------------------------------------------------------------ */
function makeLoop(host: Element, step: (t: number) => void, fps = 30) {
  let visible = false;
  let paused = false;
  let raf = 0;
  let last = 0;
  const interval = 1000 / fps;
  const run = (now: number) => {
    raf = requestAnimationFrame(run);
    if (now - last < interval) return;
    last = now - ((now - last) % interval);
    step(now / 1000);
  };
  const sync = () => {
    const on = visible && !paused && !document.hidden;
    host.classList.toggle('is-off', !on);
    if (on && !raf) raf = requestAnimationFrame(run);
    else if (!on && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const io = new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    sync();
  });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);
  return {
    pause(p: boolean) {
      paused = p;
      sync();
    },
    stop() {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/* One WebGL context shared by every Three.js field (each renders into its own target). */
let shared: THREE.WebGLRenderer | null = null;
let users = 0;
function getRenderer() {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
    shared.setPixelRatio(1);
  }
  users++;
  return shared;
}
function releaseRenderer() {
  if (--users <= 0 && shared) {
    shared.dispose();
    shared = null;
    users = 0;
  }
}
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/* ------------------------------------------------------------------ */
/* Hero (2D · A6): open network, sealed payload                         */
/* ------------------------------------------------------------------ */
// A composed 3D network (an outer ring, a middle ring and two hubs, 16 nodes) turns slowly on
// black. Routes are public: everyone sees them (fine dotted lines that light up behind each
// message). Messages travel the edges: most carry a legible value (digits and + - . , %), some carry
// a sealed payload (a 2-row block of churning cipher glyphs): same route, same motion, unreadable.
// One node is the enclave: its surface is cipher, and anything that passes through it leaves sealed.
// Scroll (setGrow 0→1) dives the camera into the enclave until it fills ~85% of the stage; inside,
// the traffic continues, all cipher, while public values still arrive along its routes.
// Drawn on the CPU straight into the glyph grid (projected shaded spheres, clipped lines, a
// z-buffer), so there is no WebGL draw or pixel readback per frame.
const SEAL_G = '{}[]<>/*;01';
const CIPH_BANDS = ['.:', ';/', '<>*', '01', '{}[]'];
const TAU = Math.PI * 2;
const NEAR = 0.15;
const DIST0 = 20; // camera distance at scroll 0
const TILT = 0.36; // look down onto the ring plane
const YAW0 = 0.5;
const TRAIL = 9; // lit route behind a message, in cells
// light from the upper left, toward the viewer
const LX = -0.5, LY = 0.6, LZ = 0.62;
const LN = Math.hypot(LX, LY, LZ);
// the enclave's interior network (unit-disc coordinates) and its links
const IN: [number, number][] = [[-0.5, -0.3], [-0.16, 0.44], [0.36, 0.24], [0.56, -0.3], [0.04, -0.62], [-0.64, 0.24], [0.06, -0.04]];
const IE: [number, number][] = [[0, 5], [5, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 6], [6, 2], [6, 4], [1, 6]];

export type HeroField = Field & {
  /** region (fractions of the host height) the object fits in at scroll progress 0 and 1 */
  setFrame: (a: { top: number; bottom: number }, b: { top: number; bottom: number }) => void;
};

/** glyph for a line with screen slope (dx in columns, dy in rows) */
const slopeGlyph = (dx: number, dy: number) => {
  let th = Math.atan2(dy, dx * charRatio);
  th = ((th % Math.PI) + Math.PI) % Math.PI;
  const d = th / Math.PI;
  return d < 0.1 || d >= 0.9 ? 45 /* - */ : d < 0.4 ? 92 /* \ */ : d < 0.6 ? 124 /* | */ : 47 /* / */;
};
/** Liang–Barsky: parametric range of a segment inside a rectangle, or null */
const clipRange = (x0: number, y0: number, x1: number, y1: number, xmin: number, ymin: number, xmax: number, ymax: number) => {
  let u0 = 0;
  let u1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const P = [-dx, dx, -dy, dy];
  const Q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return null;
      continue;
    }
    const r = Q[i] / P[i];
    if (P[i] < 0) {
      if (r > u1) return null;
      if (r > u0) u0 = r;
    } else {
      if (r < u0) return null;
      if (r < u1) u1 = r;
    }
  }
  return u0 <= u1 ? [u0, u1] : null;
};

type Msg = {
  id: number;
  e: number;
  from: number;
  t0: number;
  dur: number;
  sealed: boolean;
  val: string;
  hops: number;
  max: number;
  // per-frame
  px: number;
  py: number;
  pd: number;
  ab: number; // +1 moving a→b along edges[e]
};

export function createHeroField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): HeroField {
  // deterministic network + traffic (the reduced-motion still is always the same composition)
  let seed = 20271;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---- network ---- */
  type Nd = { x: number; y: number; z: number; R: number };
  const nodes: Nd[] = [];
  const add = (x: number, y: number, z: number, R: number) => nodes.push({ x, y, z, R }) - 1;
  const ENC = add(0.95, -0.1, 0.55, 0.34);
  const HUB = add(-1.1, 0.3, -0.75, 0.25);
  const mids: number[] = [];
  const outs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.35 + (rnd() - 0.5) * 0.35;
    mids.push(add(Math.cos(a) * 2.6, (rnd() - 0.5) * 0.8, Math.sin(a) * 2.6, 0.19));
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.1 + (rnd() - 0.5) * 0.3;
    outs.push(add(Math.cos(a) * 4.7, (rnd() - 0.5) * 1.1, Math.sin(a) * 4.7, 0.12 + rnd() * 0.06));
  }
  const d2 = (a: number, b: number) => (nodes[a].x - nodes[b].x) ** 2 + (nodes[a].y - nodes[b].y) ** 2 + (nodes[a].z - nodes[b].z) ** 2;
  const nearest = (from: number, pool: number[], n: number) => pool.slice().sort((p, q) => d2(from, p) - d2(from, q)).slice(0, n);
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const link = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(k)) return;
    seen.add(k);
    edges.push([a, b]);
  };
  outs.forEach((o, i) => {
    if (i !== 2 && i !== 6) link(o, outs[(i + 1) % outs.length]); // two gaps keep the ring open
    link(o, nearest(o, mids, 1)[0]);
  });
  [[0, 1], [2, 3], [3, 4]].forEach(([a, b]) => link(mids[a], mids[b]));
  nearest(ENC, mids, 3).forEach((m) => link(ENC, m));
  link(ENC, HUB);
  nearest(HUB, mids, 2).forEach((m) => link(HUB, m));
  const NN = nodes.length;
  const NE = edges.length;
  const adj: number[][] = nodes.map(() => []);
  edges.forEach(([a, b], i) => {
    adj[a].push(i);
    adj[b].push(i);
  });
  const elen = edges.map(([a, b]) => Math.sqrt(d2(a, b)));
  const encEdges = edges.map((e, i) => (e[0] === ENC || e[1] === ENC ? i : -1)).filter((i) => i >= 0);

  /* ---- traffic ---- */
  const fmtVal = () => {
    const k = rnd();
    const sg = rnd() < 0.5 ? '+' : '-';
    if (k < 0.3) return (12 + rnd() * 880).toFixed(2);
    if (k < 0.55) return sg + (rnd() * 4).toFixed(2);
    if (k < 0.75) return `${sg}${(rnd() * 3).toFixed(1)}%`;
    if (k < 0.9) return `${1 + Math.floor(rnd() * 98)},${String(Math.floor(rnd() * 10) * 100).padStart(3, '0')}`;
    return `0.0${100 + Math.floor(rnd() * 900)}`;
  };
  const route = (m: Msg, prev: number) => {
    const opt = adj[m.from].filter((e) => e !== prev);
    const list = opt.length ? opt : adj[m.from];
    m.e = list[Math.floor(rnd() * list.length)];
    m.dur = elen[m.e] / (0.42 * (0.8 + rnd() * 0.45));
  };
  const msgs: Msg[] = [];
  const NMSG = (host.clientWidth || window.innerWidth) < 768 ? 8 : 12;
  for (let i = 0; i < NMSG; i++) {
    const e = Math.floor(rnd() * NE);
    const m: Msg = { id: i, e, from: edges[e][rnd() < 0.5 ? 0 : 1], t0: 0, dur: 1, sealed: i % 3 === 1, val: fmtVal(), hops: 0, max: 2 + Math.floor(rnd() * 3), px: 0, py: 0, pd: 0, ab: 1 };
    m.dur = elen[e] / (0.42 * (0.8 + rnd() * 0.45));
    m.t0 = -(0.1 + rnd() * 0.8) * m.dur;
    msgs.push(m);
  }
  const advance = (m: Msg, tau: number) => {
    if (tau - (m.t0 + m.dur) > 30) m.t0 = tau - m.dur * 0.5; // after a long pause
    while (tau >= m.t0 + m.dur) {
      const [a, b] = edges[m.e];
      const to = m.from === a ? b : a;
      const prev = m.e;
      m.t0 += m.dur;
      m.from = to;
      m.hops++;
      if (m.hops >= m.max) {
        m.hops = 0;
        m.max = 2 + Math.floor(rnd() * 3);
        m.sealed = rnd() < 0.26;
        m.val = fmtVal();
      } else if (!m.sealed && rnd() < 0.5) m.val = fmtVal();
      // whatever passes through the enclave leaves it sealed
      if (to === ENC) m.sealed = true;
      route(m, prev);
    }
  };

  /* ---- fit: normalised extents over a full turn at scroll 0 (f = 1, aim at the origin) ---- */
  let fitHW = 0.25;
  let fitHH = 0.11;
  let fitYC = 0;
  // phones: a steeper view (taller ellipse for a narrow band) and a slight bleed off the sides
  let tilt0 = TILT;
  let widthK = 0.45;
  let nodeK = 1; // drawn node size (phones: a touch larger so participants read)
  const computeFit = () => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const ct = Math.cos(tilt0), st = Math.sin(tilt0);
    for (let s = 0; s < 36; s++) {
      const yw = (s / 36) * TAU;
      const cy = Math.cos(yw), sy = Math.sin(yw);
      for (const n of nodes) {
        const x = n.x * cy + n.z * sy;
        const z1 = -n.x * sy + n.z * cy;
        const y = n.y * ct - z1 * st;
        const z = n.y * st + z1 * ct;
        const d = DIST0 - z;
        const r = n.R / d;
        x0 = Math.min(x0, x / d - r);
        x1 = Math.max(x1, x / d + r);
        y0 = Math.min(y0, y / d - r);
        y1 = Math.max(y1, y / d + r);
      }
    }
    fitHW = Math.max(-x0, x1);
    fitHH = (y1 - y0) / 2;
    fitYC = (y1 + y0) / 2;
  };

  /* ---- state ---- */
  let prog = 0;
  let fA = { top: 0.42, bottom: 0.97 };
  let fB = { top: 0.1, bottom: 0.96 };
  let cols = 0;
  let rows = 0;
  let chr = new Uint16Array(0);
  let zb = new Float32Array(0);
  let occ = new Uint8Array(0);
  let reveal = opts.isStatic ? 1 : 0.3;
  let lastT = 0;
  let tau = 0; // message clock (slows as the camera closes in)
  const wx = new Float32Array(NN), wy = new Float32Array(NN), wz = new Float32Array(NN);
  const sx = new Float32Array(NN), sy = new Float32Array(NN), sd = new Float32Array(NN), sr = new Float32Array(NN);
  // near-clipped screen endpoints per edge (for the enclave's entry points)
  const ex0 = new Float32Array(NE), ey0 = new Float32Array(NE), ex1 = new Float32Array(NE), ey1 = new Float32Array(NE);
  const eok = new Uint8Array(NE);

  const resize = () => {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || window.innerHeight;
    const phone = W < 768;
    // phones: a coarser grid than 2A (bigger glyphs keep the values legible, fewer cells)
    cols = phone ? clampN(Math.round(W / 5), 72, 150) : clampN(Math.round(W / 5.6), 180, 270);
    tilt0 = phone ? 0.68 : TILT;
    widthK = phone ? 0.6 : 0.45;
    nodeK = phone ? 1.45 : 1;
    computeFit();
    const fs = W / (cols * charRatio);
    rows = Math.min(170, Math.ceil(H / fs) + 1);
    pre.style.setProperty('--fs', `${fs}px`);
    chr = new Uint16Array(cols * rows);
    zb = new Float32Array(cols * rows);
    occ = new Uint8Array(cols * rows);
  };

  const sstep = (a: number, b: number, v: number) => {
    const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  const put = (c: number, r: number, code: number, d: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    if (d < zb[i]) {
      zb[i] = d;
      chr[i] = code;
    }
  };
  const sealGlyph = (a: number, b: number, t: number) => {
    const rate = 1.5 + hash(b, a) * 4;
    return SEAL_G.charCodeAt(Math.floor(hash(a, b) * 97 + t * rate) % SEAL_G.length);
  };

  /** a deterministic public value (for the inbound traffic) */
  const fmtH = (a: number, b: number) => {
    const k = hash(a, b);
    const v = hash(b + 3.1, a + 1.7);
    const sg = hash(a + 9.2, b) < 0.5 ? '+' : '-';
    if (k < 0.3) return (12 + v * 880).toFixed(2);
    if (k < 0.55) return sg + (v * 4).toFixed(2);
    if (k < 0.8) return `${sg}${(v * 3).toFixed(1)}%`;
    return `${1 + Math.floor(v * 98)},${Math.floor(hash(a, b + 5) * 10)}00`;
  };

  const draw = (t: number) => {
    if (!cols) return;
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    const p = opts.isStatic ? 0 : prog;
    const kz = sstep(0, 0.92, p); // zoom
    const ka = sstep(0, 0.6, p); // aim: network centre → enclave
    const fo = opts.isStatic ? 0 : sstep(0.5, 0.88, p); // the rest of the network dissolves away
    const inner = opts.isStatic ? 0 : sstep(0.4, 0.8, p); // the enclave opens up
    const inbound = opts.isStatic ? 0 : sstep(0.5, 0.85, p); // public values visibly arriving

    // framing: fit the network into region A; at the end the enclave fills region B
    const aTop = fA.top * rows, aBot = fA.bottom * rows;
    const regHalf = Math.max(4, (aBot - aTop) / 2 - 1.5);
    const f = Math.min(regHalf / fitHH, (cols * widthK * charRatio) / fitHW);
    const cyA = (aTop + aBot) / 2 + fitYC * f;
    const bTop = fB.top * rows, bBot = fB.bottom * rows;
    const cyB = (bTop + bBot) / 2;
    const targetR = Math.min(((bBot - bTop) / 2) * 0.94, cols * 0.5 * charRatio * 0.88);
    const RE = nodes[ENC].R;
    const dist1 = Math.min(DIST0, (RE * nodeK * f) / targetR);
    const dist = DIST0 * Math.pow(dist1 / DIST0, kz);
    if (!opts.isStatic) tau += dt * Math.max(0.1, Math.pow(dist / DIST0, 0.85));

    // pose: calm turn (time) + a little extra turn and flattening with scroll
    const yaw = YAW0 + t * 0.045 + p * 0.6;
    const tilt = tilt0 - p * 0.1;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < NN; i++) {
      const n = nodes[i];
      const x = n.x * cyw + n.z * syw;
      const z1 = -n.x * syw + n.z * cyw;
      wx[i] = x;
      wy[i] = n.y * ct - z1 * st;
      wz[i] = n.y * st + z1 * ct;
    }
    const ax = wx[ENC] * ka, ay = wy[ENC] * ka, az = wz[ENC] * ka;
    const camZ = az + dist;
    const cx = cols / 2;
    const cy = mix(cyA, cyB, ka);
    const pr = { x: 0, y: 0, d: 1 };
    const proj = (x: number, y: number, z: number) => {
      const d = camZ - z;
      pr.d = d;
      pr.x = cx + ((x - ax) * f) / d / charRatio;
      pr.y = cy - ((y - ay) * f) / d;
    };
    for (let i = 0; i < NN; i++) {
      proj(wx[i], wy[i], wz[i]);
      sx[i] = pr.x;
      sy[i] = pr.y;
      sd[i] = pr.d;
      sr[i] = pr.d > NEAR ? (nodes[i].R * nodeK * f) / pr.d : 0;
    }
    const ex = sx[ENC], ey = sy[ENC], rE = sr[ENC], dE = sd[ENC];
    const aimD = dist; // depth of the aim plane

    chr.fill(32);
    zb.fill(1e9);
    occ.fill(0);

    /* messages: advance + project */
    for (const m of msgs) {
      advance(m, tau);
      const [a, b] = edges[m.e];
      const to = m.from === a ? b : a;
      const s = Math.min(1, Math.max(0, (tau - m.t0) / m.dur));
      proj(mix(wx[m.from], wx[to], s), mix(wy[m.from], wy[to], s), mix(wz[m.from], wz[to], s));
      m.px = pr.x;
      m.py = pr.y;
      m.pd = pr.d;
      m.ab = m.from === a ? 1 : -1;
    }

    /* routes: dotted at rest, lit (slope glyphs) behind each message */
    for (let ei = 0; ei < NE; ei++) {
      eok[ei] = 0;
      const [a, b] = edges[ei];
      const incE = a === ENC || b === ENC;
      if (!incE && fo >= 0.999) continue;
      let da = sd[a], db = sd[b];
      if (da < NEAR && db < NEAR) continue;
      let Ax = wx[a], Ay = wy[a], Az = wz[a], Bx = wx[b], By = wy[b], Bz = wz[b];
      if (da < NEAR) {
        const u = (NEAR - da) / (db - da);
        Ax = mix(Ax, Bx, u); Ay = mix(Ay, By, u); Az = mix(Az, Bz, u);
        da = NEAR;
      } else if (db < NEAR) {
        const u = (NEAR - db) / (da - db);
        Bx = mix(Bx, Ax, u); By = mix(By, Ay, u); Bz = mix(Bz, Az, u);
        db = NEAR;
      }
      proj(Ax, Ay, Az);
      const x0 = pr.x, y0 = pr.y;
      proj(Bx, By, Bz);
      const x1 = pr.x, y1 = pr.y;
      ex0[ei] = x0; ey0[ei] = y0; ex1[ei] = x1; ey1[ei] = y1; eok[ei] = 1;
      const rg = clipRange(x0, y0, x1, y1, -1, -1, cols, rows);
      if (!rg) continue;
      const dx = x1 - x0, dy = y1 - y0;
      const L2 = dx * dx + dy * dy || 1;
      const len = Math.sqrt(L2);
      const tr = TRAIL / len;
      const gl = slopeGlyph(dx, dy);
      const back = (da + db) / 2 > aimD + 0.6; // far half of the ring: sparser dots
      // messages on this edge (screen param + direction)
      let n1 = -1, n2 = -1, u1p = 0, u2p = 0, d1 = 0, d2p = 0;
      for (const m of msgs) {
        if (m.e !== ei || m.pd < NEAR) continue;
        const up = ((m.px - x0) * dx + (m.py - y0) * dy) / L2;
        if (n1 < 0) { n1 = m.id; u1p = up; d1 = m.ab; } else { n2 = m.id; u2p = up; d2p = m.ab; }
      }
      const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * (rg[1] - rg[0])) + 1;
      for (let k = 0; k <= steps; k++) {
        const u = rg[0] + ((rg[1] - rg[0]) * k) / steps;
        const c = Math.round(x0 + dx * u);
        const r = Math.round(y0 + dy * u);
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        if (!incE && fo > 0 && hash(c * 0.37, r * 1.3) < fo) continue;
        const dd = 1 / ((1 - u) / da + u / db);
        const lit =
          (n1 >= 0 && (d1 > 0 ? u <= u1p && u >= u1p - tr : u >= u1p && u <= u1p + tr)) ||
          (n2 >= 0 && (d2p > 0 ? u <= u2p && u >= u2p - tr : u >= u2p && u <= u2p + tr));
        if (lit) put(c, r, gl, dd - 0.02);
        else if (!back || (c + r) % 2 === 0) put(c, r, 46 /* . */, dd);
      }
    }

    /* participants: crisp rings with a core (one glyph thin), far ones collapse to (o) / o / . */
    const ring = (pc: number, pr0: number, rr: number, d: number) => {
      // one glyph thin: a cell is on the ring when the circle crosses it along its dominant axis
      const rc = rr / charRatio + 1;
      for (let r = Math.max(0, Math.floor(pr0 - rr - 1)); r <= Math.min(rows - 1, Math.ceil(pr0 + rr + 1)); r++) {
        const Y = r - pr0;
        for (let c = Math.max(0, Math.floor(pc - rc)); c <= Math.min(cols - 1, Math.ceil(pc + rc)); c++) {
          const X = (c - pc) * charRatio;
          const D = Math.hypot(X, Y) || 1e-6;
          const nx = X / D, ny = Y / D;
          if (Math.abs(D - rr) <= 0.5 * Math.max(Math.abs(nx) * charRatio, Math.abs(ny))) put(c, r, slopeGlyph(-ny / charRatio, nx), d);
        }
      }
    };
    const disc = (pc: number, pr0: number, rr: number, d: number, fill: (c: number, r: number, q: number) => number) => {
      const rc = rr / charRatio;
      for (let r = Math.max(0, Math.floor(pr0 - rr)); r <= Math.min(rows - 1, Math.ceil(pr0 + rr)); r++) {
        for (let c = Math.max(0, Math.floor(pc - rc)); c <= Math.min(cols - 1, Math.ceil(pc + rc)); c++) {
          const nx = ((c - pc) * charRatio) / rr;
          const ny = (r - pr0) / rr;
          const q = nx * nx + ny * ny;
          if (q <= 1) put(c, r, fill(c, r, q), d);
        }
      }
    };
    for (let i = 0; i < NN; i++) {
      if (i === ENC || sd[i] < NEAR) continue;
      if (fo > 0 && hash(i * 7.3, 1.1) < fo) continue;
      const rr = sr[i];
      const c = Math.round(sx[i]), r = Math.round(sy[i]);
      const d = sd[i] - nodes[i].R;
      if (rr < 0.7) put(c, r, 46, d);
      else if (rr < 1.3) put(c, r, 111 /* o */, d);
      else if (rr < 2.1) {
        put(c - 1, r, 40, d);
        put(c, r, 111, d);
        put(c + 1, r, 41, d);
      } else if (rr < 3.4) {
        // .-.
        //( o )
        // '-'
        put(c - 1, r - 1, 46, d); put(c, r - 1, 45, d); put(c + 1, r - 1, 46, d);
        put(c - 2, r, 40, d); put(c - 1, r, 32, d); put(c, r, 111, d); put(c + 1, r, 32, d); put(c + 2, r, 41, d);
        put(c - 1, r + 1, 39, d); put(c, r + 1, 45, d); put(c + 1, r + 1, 39, d);
      } else {
        disc(sx[i], sy[i], rr, sd[i], () => 32); // routes end at the rim
        ring(sx[i], sy[i], rr, d);
        put(c, r, rr > 2.8 ? 64 /* @ */ : 111, d);
      }
    }

    /* the enclave: a cipher sphere; with scroll its surface dissolves into the sealed interior */
    const inDisc = (c: number, r: number) => {
      const nx = ((c - ex) * charRatio) / rE;
      const ny = (r - ey) / rE;
      return nx * nx + ny * ny;
    };
    const openCell = (c: number, r: number) => inner > 0 && hash(c * 1.37 + 0.5, r * 0.71 + 0.25) < inner;
    if (dE > NEAR && rE > 0.5) {
      const rc = rE / charRatio;
      for (let r = Math.max(0, Math.floor(ey - rE)); r <= Math.min(rows - 1, Math.ceil(ey + rE)); r++) {
        for (let c = Math.max(0, Math.floor(ex - rc)); c <= Math.min(cols - 1, Math.ceil(ex + rc)); c++) {
          const nx = ((c - ex) * charRatio) / rE;
          const ny = (r - ey) / rE;
          const q = nx * nx + ny * ny;
          if (q > 1) continue;
          const nz = Math.sqrt(1 - q);
          let g: number;
          if (openCell(c, r)) {
            // sealed volume: sparse cipher grain, alive
            const h = hash(c + 11.3, r + 7.7);
            g = h > 0.994 ? sealGlyph(c, r, t) : h > 0.982 ? 46 : 32;
          } else {
            const lum = Math.max(0, (nx * LX - ny * LY + nz * LZ) / LN);
            const set = CIPH_BANDS[Math.min(4, Math.floor(lum * 5.2))];
            g = set.charCodeAt(Math.floor(hash(c, r) * 97 + t * (1 + hash(r, c) * 3)) % set.length);
          }
          put(c, r, g, dE - RE * nz);
        }
      }
      // boundary: a crisp one-glyph wall, plus a dotted halo while it is still small
      ring(ex, ey, rE, dE - RE - 0.03);
      const halo = 1 - sstep(0, 0.25, inner);
      if (halo > 0) {
        const hr = rE * 1.55;
        const n = Math.ceil(((TAU * hr) / charRatio) * 1.4);
        for (let k = 0; k < n; k++) {
          const ph = (k / n) * TAU;
          const c = Math.round(ex + (Math.cos(ph) * hr) / charRatio);
          const r = Math.round(ey + Math.sin(ph) * hr);
          if ((c + r) % 2 === 0 && hash(c, r * 1.7) < halo) put(c, r, 46, dE - RE * 0.2);
        }
      }
    }

    /* inside the enclave: the traffic continues, all cipher */
    const zIn = dE - RE - 0.01;
    const putIn = (c: number, r: number, code: number) => {
      if (inDisc(c, r) < 0.93 && openCell(c, r)) put(c, r, code, zIn);
    };
    const block = (pc: number, pr0: number, w: number, h: number, id: number, inside: boolean, d: number) => {
      const c0 = Math.round(pc - w / 2);
      const r0 = Math.round(pr0 - (h - 1) / 2);
      for (let j = 0; j < h; j++) {
        for (let i = -1; i <= w; i++) {
          const g = i < 0 || i === w ? 32 : sealGlyph(id * 13.1 + i, j + id * 0.7, t);
          if (inside) putIn(c0 + i, r0 + j, g);
          else put(c0 + i, r0 + j, g, d);
          if (c0 + i >= 0 && c0 + i < cols && r0 + j >= 0 && r0 + j < rows) occ[(r0 + j) * cols + c0 + i] = 1;
        }
      }
    };
    // a public value: legible on the open network, sealed glyph by glyph inside the enclave's wall
    const label = (pc: number, pr0: number, str: string, d: number) => {
      const w = str.length;
      const c0 = Math.round(pc - w / 2);
      const r0 = Math.round(pr0);
      for (let i = -1; i <= w; i++) {
        const c = c0 + i;
        let g = i < 0 || i === w ? 32 : str.charCodeAt(i);
        if (g !== 32 && rE > 1.5 && inDisc(c, r0) < 1) g = sealGlyph(c * 0.7 + 3, r0, t);
        put(c, r0, g, d);
        if (c >= 0 && c < cols && r0 >= 0 && r0 < rows) occ[r0 * cols + c] = 1;
      }
    };
    if (inner > 0 && dE > NEAR) {
      const rho = t * 0.025;
      const cr = Math.cos(rho), srh = Math.sin(rho);
      const iu: number[] = [], iv: number[] = [];
      for (const [u, v] of IN) {
        iu.push(u * cr - v * srh);
        iv.push(u * srh + v * cr);
      }
      // entry points on the wall where the enclave's public routes arrive
      const links: [number, number, number, number][] = IE.map(([a, b]) => [iu[a], iv[a], iu[b], iv[b]]);
      for (const ei of encEdges) {
        if (!eok[ei]) {
          links.push([0, 0, 0, 0]); // keep entries aligned with encEdges
          continue;
        }
        const atA = edges[ei][0] === ENC;
        const ox = atA ? ex1[ei] : ex0[ei], oy = atA ? ey1[ei] : ey0[ei];
        const th = Math.atan2(oy - ey, (ox - ex) * charRatio);
        const pu = Math.cos(th) * 0.97, pv = Math.sin(th) * 0.97;
        let best = 0, bd = Infinity;
        for (let i = 0; i < iu.length; i++) {
          const q = (iu[i] - pu) ** 2 + (iv[i] - pv) ** 2;
          if (q < bd) { bd = q; best = i; }
        }
        links.push([pu, pv, iu[best], iv[best]]);
      }
      const toC = (u: number) => ex + (u * rE) / charRatio;
      const toR = (v: number) => ey + v * rE;
      // inner routes: quiet dots
      for (const [u0, v0, u1, v1] of links) {
        const c0 = toC(u0), r0 = toR(v0), c1 = toC(u1), r1 = toR(v1);
        const steps = Math.ceil(Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))) + 1;
        for (let k = 0; k <= steps; k++) {
          const c = Math.round(c0 + ((c1 - c0) * k) / steps);
          const r = Math.round(r0 + ((r1 - r0) * k) / steps);
          if ((c + r) % 2 === 0) putIn(c, r, 46);
        }
      }
      // inner nodes: the same participant language as outside
      for (let i = 0; i < iu.length; i++) {
        const c = Math.round(toC(iu[i])), r = Math.round(toR(iv[i]));
        if (rE > 20) {
          putIn(c - 1, r - 1, 46); putIn(c, r - 1, 45); putIn(c + 1, r - 1, 46);
          putIn(c - 2, r, 40); putIn(c - 1, r, 32); putIn(c, r, 111); putIn(c + 1, r, 32); putIn(c + 2, r, 41);
          putIn(c - 1, r + 1, 39); putIn(c, r + 1, 45); putIn(c + 1, r + 1, 39);
        } else {
          putIn(c - 1, r, 40); putIn(c, r, 111); putIn(c + 1, r, 41);
        }
      }
      // a sealed block running a route, lighting the route behind it (same language as outside)
      const bw = clampN(Math.round(rE * 0.28), 3, 12);
      const bh = rE > 16 ? 2 : 1;
      const runInner = (L: [number, number, number, number], s0: number, id: number) => {
        const c0 = toC(L[0]), r0 = toR(L[1]), c1 = toC(L[2]), r1 = toR(L[3]);
        const len = Math.max(1, Math.hypot(c1 - c0, r1 - r0));
        const gl = slopeGlyph(c1 - c0, r1 - r0);
        for (let k = 1; k <= TRAIL; k++) {
          const sb = s0 - k / len;
          if (sb < 0) break;
          putIn(Math.round(mix(c0, c1, sb)), Math.round(mix(r0, r1, sb)), gl);
        }
        block(mix(c0, c1, s0), mix(r0, r1, s0), bw, bh, id, true, zIn);
      };
      const NI = 7;
      for (let j = 0; j < NI; j++) {
        const L = links[(j * 3 + 1) % IE.length];
        const fwd = j % 2 === 0;
        const s0 = (t * (0.05 + hash(j, 1.3) * 0.05) + hash(j, 2.1)) % 1;
        runInner(fwd ? L : [L[2], L[3], L[0], L[1]], s0, 40 + j);
      }
      // inbound: public values arrive along the enclave's routes, legible outside the wall, sealed
      // glyph by glyph as they cross it, then carried inward as a cipher block
      if (inbound > 0) {
        let k = 0;
        for (const ei of encEdges) {
          const li = IE.length + k++;
          if (!eok[ei] || li >= links.length) continue;
          const atA = edges[ei][0] === ENC;
          const ox = atA ? ex1[ei] : ex0[ei], oy = atA ? ey1[ei] : ey0[ei];
          const rg = clipRange(ex, ey, ox, oy, 0, 0, cols - 1, rows - 1);
          const ux = (ox - ex) * charRatio, uy = oy - ey;
          const ul = Math.hypot(ux, uy) || 1;
          const lout = rg ? Math.max(0, ul * rg[1] - rE) : 0;
          const L = links[li];
          const lin = Math.max(1, Math.hypot((L[2] - L[0]) * rE, (L[3] - L[1]) * rE));
          const total = lout + lin;
          if (total < 2) continue;
          const gl = slopeGlyph(ux / charRatio, uy);
          for (let j = 0; j < 2; j++) {
            if (hash(ei + 0.3, j + 0.6) > inbound) continue;
            const run = t * 4.2 + j * total * 0.5 + hash(ei, 4.4) * total;
            const pos = run % total;
            const cyc = Math.floor(run / total);
            if (pos < lout) {
              const dd = rE + (lout - pos);
              const pc = ex + ((ux / ul) * dd) / charRatio, pr2 = ey + (uy / ul) * dd;
              for (let q = 1; q <= TRAIL * 2; q++) {
                const d2 = dd + q * 0.5;
                put(Math.round(ex + ((ux / ul) * d2) / charRatio), Math.round(ey + (uy / ul) * d2), gl, 0.01); // overlay: above the routes
              }
              label(pc, pr2, fmtH(ei * 3.1 + j, cyc), 0);
            } else runInner(L, (pos - lout) / lin, 70 + ei * 2 + j);
          }
        }
      }
    }

    /* messages on the open network: public values are legible, sealed payloads are not */
    const order = msgs.slice().sort((m1, m2) => m1.pd - m2.pd);
    for (const m of order) {
      if (m.pd < NEAR) continue;
      const onE = edges[m.e][0] === ENC || edges[m.e][1] === ENC;
      if (!onE && fo > 0 && hash(m.id * 3.7, 3.3) < fo) continue;
      const q = rE > 0.5 ? inDisc(m.px, m.py) : 9;
      const inside = q < 1;
      if (inside && inner > 0.5 && q < 0.72) continue; // the inner traffic takes over
      const d = inside ? dE - RE - 0.02 : m.pd - 3; // values sit on top of the routes
      const sealed = m.sealed || inside;
      const w = sealed ? 7 : m.val.length;
      const h = sealed ? 2 : 1;
      const c0 = Math.round(m.px - w / 2);
      const r0 = Math.round(m.py - (h - 1) / 2);
      // overlapping a nearer message: just a dot on the route
      let free = true;
      for (let j = 0; j < h && free; j++) {
        for (let i = -1; i <= w; i++) {
          const c = c0 + i, r = r0 + j;
          if (c >= 0 && r >= 0 && c < cols && r < rows && occ[r * cols + c]) {
            free = false;
            break;
          }
        }
      }
      if (!free) {
        put(Math.round(m.px), Math.round(m.py), 111, d);
        continue;
      }
      if (sealed) block(m.px, m.py, w, h, m.id, false, d);
      else label(m.px, m.py, m.val, d);
    }

    /* intro reveal + output */
    let out = '';
    for (let r = 0; r < rows; r++) {
      const base = r * cols;
      if (reveal < 1) {
        for (let c = 0; c < cols; c++) {
          const hh = hash(c, r);
          if (hh > reveal) chr[base + c] = 32;
          else if (hh > reveal - 0.08 && chr[base + c] !== 32) chr[base + c] = SCR.charCodeAt((Math.random() * SCR.length) | 0);
        }
      }
      out += String.fromCharCode(...chr.subarray(base, base + cols));
      if (r < rows - 1) out += '\n';
    }
    pre.textContent = out;
  };

  // time-driven loop (30 fps, paused off-screen / when covered / modal open)
  let t0 = 0;
  let tNow = 0;
  const loop = opts.isStatic
    ? null
    : makeLoop(host, (now) => {
        if (!t0) t0 = now;
        tNow = now - t0;
        draw(tNow);
      }, 30);
  // static (reduced motion): redraw on demand only
  let raf = 0;
  const schedule = () => {
    if (!opts.isStatic || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw(0);
    });
  };

  resize();
  draw(0);
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw(opts.isStatic ? 0 : tNow);
    },
    render: () => draw(opts.isStatic ? 0 : tNow),
    setReveal: (v) => {
      reveal = v;
      schedule();
    },
    setGrow: (v) => {
      prog = opts.isStatic ? 0 : v;
      schedule();
    },
    setFrame: (a, b) => {
      fA = a;
      fB = b;
      schedule();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      loop?.stop();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shift: a public market tape with one sealed (private) band          */
/* ------------------------------------------------------------------ */
// Candlesticks scroll left one candle at a time over a faint price grid. A vertical band in the
// middle is "sealed": whatever crosses it densifies into an encrypted block of glyphs, while the
// rest of the tape stays public. Calm by design: 15 fps, one candle step every ~1.1 s, and only a
// small fraction of the sealed cells re-roll per frame.
const SEAL = '{}[]01<>/*;=';
export function createShiftField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): Field {
  let cols = 0;
  let rows = 0;
  let cell: string[] = [];
  let seal: string[] = [];
  let t0 = 0;
  // deterministic random-walk price series
  const N = 4096;
  const price = new Float32Array(N);
  let seed = 7331;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  price[0] = 100;
  for (let i = 1; i < N; i++) price[i] = price[i - 1] + (rnd() - 0.48) * 2.4 + Math.sin(i / 23) * 0.5;
  const wickUp = new Float32Array(N).map(() => rnd() * 1.4);
  const wickDn = new Float32Array(N).map(() => rnd() * 1.4);
  const vol = new Float32Array(N).map(() => 0.25 + rnd() * 0.75);

  const resize = () => {
    const W = host.clientWidth || 600;
    const H = host.clientHeight || 360;
    cols = clampN(Math.round(W / 5.5), 72, 140);
    const fs = W / (cols * charRatio);
    rows = Math.min(120, Math.ceil(H / fs));
    pre.style.setProperty('--fs', `${fs}px`);
    cell = new Array(cols * rows).fill(' ');
    seal = new Array(cols * rows).fill(' ').map((_, k) => SEAL[(hash(k % cols, (k / cols) | 0) * SEAL.length) | 0]);
  };

  const draw = (t: number) => {
    const STEP = 4; // candle body 3 cols + 1 gap
    const n = Math.floor(cols / STEP) + 1;
    const shift = Math.floor(t / 1.1);
    const top = 1;
    const volH = Math.max(3, Math.round(rows * 0.14));
    const bot = rows - volH - 2; // last price row
    // visible range
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const k = (i + shift + 1) % N;
      const o = price[(k - 1 + N) % N];
      const c = price[k];
      lo = Math.min(lo, Math.min(o, c) - wickDn[k]);
      hi = Math.max(hi, Math.max(o, c) + wickUp[k]);
    }
    const span = Math.max(1e-3, hi - lo);
    const y = (p: number) => Math.round(bot - ((p - lo) / span) * (bot - top));
    cell.fill(' ');
    // faint price grid
    for (let r = top; r <= bot; r += 4) for (let c = 0; c < cols; c += 2) cell[r * cols + c] = '.';
    // candles + volume
    for (let i = 0; i < n; i++) {
      const k = (i + shift + 1) % N;
      const o = price[(k - 1 + N) % N];
      const c = price[k];
      const up = c >= o;
      const x = i * STEP;
      const yb0 = y(Math.max(o, c));
      const yb1 = y(Math.min(o, c));
      const yh = y(Math.max(o, c) + wickUp[k]);
      const yl = y(Math.min(o, c) - wickDn[k]);
      for (let r = yh; r <= yl; r++) if (x + 1 < cols) cell[r * cols + x + 1] = '|';
      for (let r = yb0; r <= yb1; r++) {
        for (let dx = 0; dx < 3; dx++) {
          const cx = x + dx;
          if (cx >= cols) continue;
          cell[r * cols + cx] = dx === 0 ? '[' : dx === 2 ? ']' : up ? '#' : '=';
        }
      }
      const vh = Math.max(1, Math.round(vol[k] * volH));
      for (let v = 0; v < vh; v++) {
        const r = rows - 1 - v;
        for (let dx = 0; dx < 3; dx++) if (x + dx < cols) cell[r * cols + x + dx] = v === vh - 1 ? '-' : ':';
      }
    }
    // baseline under the price area
    for (let c = 0; c < cols; c++) cell[(bot + 1) * cols + c] = '_';
    // sealed band: everything inside densifies into an encrypted block
    const b0 = Math.round(cols * 0.46);
    const b1 = Math.round(cols * 0.7);
    if (!opts.isStatic) for (let i = 0; i < 40; i++) {
      const k = (Math.random() * seal.length) | 0;
      seal[k] = SEAL[(Math.random() * SEAL.length) | 0];
    }
    for (let r = 0; r < rows; r++) {
      for (let c = b0; c <= b1; c++) {
        const k = r * cols + c;
        if (c === b0 || c === b1) cell[k] = '|';
        else if (r === 0 || r === rows - 1) cell[k] = '=';
        else if (cell[k] !== ' ' && cell[k] !== '.') cell[k] = seal[k];
        else cell[k] = hash(c, r) > 0.55 ? seal[k] : ':';
      }
    }
    let out = '';
    for (let r = 0; r < rows; r++) {
      out += cell.slice(r * cols, (r + 1) * cols).join('');
      if (r < rows - 1) out += '\n';
    }
    pre.textContent = out;
  };

  const loop = opts.isStatic
    ? null
    : makeLoop(host, (now) => {
        if (!t0) t0 = now;
        draw(now - t0);
      }, 15);

  resize();
  draw(0);
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw(opts.isStatic || !t0 ? 0 : performance.now() / 1000 - t0);
    },
    render: () => draw(0),
    setReveal: () => {},
    dispose: () => loop?.stop(),
  };
}

/* ------------------------------------------------------------------ */
/* Format: NYC skyline silhouette in density characters                */
/* ------------------------------------------------------------------ */
type Bldg = { x0: number; x1: number; h: number; layer: 0 | 1; steps: number; spire: number };

export function createSkyField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): Field {
  let cols = 0;
  let rows = 0;
  let heights: Float32Array = new Float32Array(0);
  let bl: Bldg[] = [];
  let grow = opts.isStatic ? 1 : 0;
  let lit = new Uint8Array(0);

  const build = () => {
    let seed = 4242;
    // building widths scale with the column count so the skyline keeps its proportions
    const sc = cols / 110;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    bl = [];
    // back layer: taller, lighter; front layer: shorter, denser
    for (const layer of [0, 1] as const) {
      let x = -2;
      while (x < cols) {
        const w = Math.max(3, Math.round(((layer ? 4 : 5) + rnd() * (layer ? 7 : 9)) * sc));
        const base = layer ? 0.12 + rnd() * 0.3 : 0.28 + rnd() * 0.36;
        bl.push({ x0: Math.round(x), x1: Math.round(x + w), h: base, layer, steps: rnd() < 0.3 ? 2 : 0, spire: 0 });
        x += w + (rnd() < 0.25 ? 1 : 0);
      }
    }
    // landmarks: a stepped spire tower (midtown) and a tapered tower (downtown)
    const lm = (fx: number, w: number, h: number, steps: number, spire: number) => {
      const x0 = Math.round(cols * fx - w / 2);
      bl.push({ x0, x1: x0 + w, h, layer: 0, steps, spire });
    };
    lm(0.6, Math.round(11 * sc), 0.74, 3, 0.12);
    lm(0.84, Math.round(9 * sc), 0.82, 4, 0.1);
    lm(0.33, Math.round(8 * sc), 0.62, 2, 0.05);
    lit = new Uint8Array(cols * rows);
    for (let i = 0; i < lit.length; i++) lit[i] = rnd() < 0.42 ? 1 : 0;
  };

  const resize = () => {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || 400;
    cols = W < 720 ? clampN(Math.round(W / 3.5), 96, 200) : clampN(Math.round(W / 6.5), 170, 260);
    const fs = W / (cols * charRatio);
    rows = Math.min(160, Math.ceil(H / fs));
    pre.style.setProperty('--fs', `${fs}px`);
    heights = new Float32Array(cols);
    build();
  };

  const draw = () => {
    // flicker a few windows
    if (!opts.isStatic) for (let i = 0; i < 18; i++) lit[(Math.random() * lit.length) | 0] ^= 1;
    const g = grow;
    const ease = (v: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 3);
    const cell: string[] = new Array(cols * rows).fill(' ');
    // back layer (0: taller, lighter glyphs) first, then the front layer (1) over it
    for (const L of [bl.filter((b) => b.layer === 0), bl.filter((b) => b.layer === 1)]) {
      for (const b of L) {
        const delay = (b.x0 / cols) * 0.35;
        const hh = Math.round(b.h * rows * ease((g - delay) / 0.65));
        if (hh <= 0) continue;
        const w = b.x1 - b.x0;
        for (let c = Math.max(0, b.x0); c < Math.min(cols, b.x1); c++) {
          const lc = c - b.x0;
          // setbacks: inner columns rise higher in steps
          let top = hh;
          if (b.steps) {
            const edge = Math.min(lc, w - 1 - lc);
            const stepW = Math.max(1, Math.floor(w / (2 * b.steps + 1)));
            top = Math.round(hh * (1 - 0.12 * (b.steps - Math.min(b.steps, Math.floor(edge / stepW)))));
          }
          for (let rb = 0; rb < top && rb < rows; rb++) {
            const r = rows - 1 - rb;
            const k = r * cols + c;
            let ch: string;
            const back = b.layer === 0;
            if (rb === top - 1) ch = back ? '-' : '=';
            else if (lc === 0) ch = back ? ':' : '[';
            else if (lc === w - 1) ch = back ? ':' : ']';
            else if (lc % 2 === 1 && rb % 2 === 1 && rb < top - 2) ch = lit[k] ? (back ? '+' : ((c + rb) % 3 ? '0' : '1')) : back ? '.' : ' ';
            else ch = back ? (rb % 3 === 0 ? '-' : ':') : (rb % 4 === 0 ? '{' : lc % 3 === 0 ? '(' : ';');
            cell[k] = ch;
          }
          // spire
          if (b.spire && lc === Math.floor(w / 2)) {
            const sp = Math.round(b.spire * rows * ease((g - delay - 0.2) / 0.5));
            for (let s = 0; s < sp; s++) {
              const rb = top + s;
              if (rb >= rows) break;
              cell[(rows - 1 - rb) * cols + c] = s === sp - 1 ? '*' : '/';
            }
          }
        }
      }
    }
    // street line
    for (let c = 0; c < cols; c++) if (cell[(rows - 1) * cols + c] === ' ') cell[(rows - 1) * cols + c] = '_';
    let out = '';
    for (let r = 0; r < rows; r++) {
      out += cell.slice(r * cols, (r + 1) * cols).join('');
      if (r < rows - 1) out += '\n';
    }
    pre.textContent = out;
  };

  const loop = opts.isStatic ? null : makeLoop(host, () => draw(), 12);
  resize();
  draw();
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw();
    },
    render: draw,
    setReveal: () => {},
    setGrow: (v) => {
      grow = v;
      if (opts.isStatic) draw();
    },
    dispose: () => loop?.stop(),
  };
}
