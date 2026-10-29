// v4B-NEARCON 2E (A7) ASCII fields (forked from 2A; only the hero changes).
//  - Hero (2E): "the open market, seen through a privacy lens". A market of legible quotes is
//    simulated straight into the character grid (no WebGL); a lens over that same field writes
//    everything inside it as cipher glyphs with identical motion. Time-driven from the first
//    frame + scroll-linked (the lens grows to ~85% of the viewport). ~30 fps, paused off-screen.
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
/* Hero (2E · A7): the open market, seen through a privacy lens        */
/* ------------------------------------------------------------------ */
// "Open Markets, Private Money". A living market is simulated straight into the character grid:
// agents (quotes, deltas, sizes) circle a few drifting venues, travel between them and trade when
// they meet (a dotted link + both quotes re-print). Out in the open everything is LEGIBLE
// (digits, + - . , %). A lens (the enclave) sits ON that same field: every cell inside it is
// re-sampled through a mild magnifying distortion and written as CIPHER glyphs, so the same
// agents keep exactly the same motion, but you can only tell that something moves, never what.
// Time-driven from the first frame (market + lens drift) and scroll-driven on top: through the
// pinned runway the lens grows from a circle in the band under the title into a squircle
// covering ~85% of the viewport. No WebGL: one pass over the grid per frame, ~30 fps.
export type HeroField = Field & {
  /** region (fractions of the host height) the object fits in at scroll progress 0 and 1 */
  setFrame: (a: { top: number; bottom: number }, b: { top: number; bottom: number }) => void;
};

// glyph vocabulary: the meaning lives in the glyphs
const C = (s: string) => s.charCodeAt(0);
const SP = 32;
const NL = 10;
const PUB_GRID = C('.'); // ledger grid, open
const PUB_TRAIL = C('.'); // where quotes have been
const PUB_LINK = C(':'); // a trade between two agents
const PRV_GRID = C('+'); // the same grid, seen through the glass
const PRV_LINK = C('~');
const HEAVY = [...'{}[]<>#=*'].map(C); // a quote, enciphered
const PRV_TRAIL = C(':'); // motion stays visible, quietly
// cell kinds in the source (open) layer
const K_NONE = 0, K_GRID = 1, K_TRAIL = 2, K_LINK = 3, K_TOKEN = 4;

type Agent = {
  x: number; y: number; vx: number; vy: number;
  ven: number; rho: number; phi: number; om: number; sw: number;
  fmt: number; val: number; txt: string; tick: number; cd: number;
  hx: Float32Array; hy: Float32Array; hn: number; ht: number;
};
type Trade = { a: number; b: number; t: number };
const TRAIL = 8;
const TRADE_LIFE = 1.6;

export function createHeroField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): HeroField {
  // deterministic randomness so the still frame (reduced motion) is composed the same every time
  let seed = 90210;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  let prog = 0; // scroll progress through the pinned runway (0 → 1)
  let fA = { top: 0.42, bottom: 0.97 };
  let fB = { top: 0.1, bottom: 0.96 };
  let reveal = opts.isStatic ? 1 : 0.3;

  let W = 1, H = 1, cols = 0, rows = 0, cw = 6, ch = 10;
  let srcK = new Uint8Array(0); // open layer: kind
  let srcG = new Uint8Array(0); // open layer: glyph
  let out = new Uint8Array(0); // rows × (cols + 1) incl. newlines
  let U = new Float32Array(0); // lens radius per cell (≥1 outside)
  const dec = new TextDecoder();

  // venues: where liquidity gathers (normalised in the visible region, drifting slowly)
  const VEN = [
    [0.12, 0.42], [0.33, 0.72], [0.52, 0.3], [0.7, 0.66], [0.9, 0.38], [0.42, 0.55],
    // fringe venues: at the end of the runway they keep an open market around the lens rim
    [0.22, 0.0], [0.78, 1.0],
  ].map(([x, y], i) => ({ bx: x, by: y, ph: i * 1.7, x: 0, y: 0 }));
  let agents: Agent[] = [];
  const trades: Trade[] = [];
  let simH = 400; // height (px) of the simulated market = the frame at the end of the runway
  const syncSim = () => {
    const nh = Math.max(160, (fB.bottom - fB.top) * H);
    if (Math.abs(nh - simH) < 0.5) return;
    const k = nh / simH;
    agents.forEach((a) => {
      a.y *= k;
      for (let h = 0; h < TRAIL; h++) a.hy[h] *= k;
    });
    simH = nh;
  };

  const fmtVal = (a: Agent) => {
    const v = a.val;
    if (a.fmt === 0) return v.toFixed(2);
    if (a.fmt === 1) return (v >= 0 ? '+' : '') + v.toFixed(2);
    if (a.fmt === 2) return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    return Math.round(v).toLocaleString('en-US');
  };
  const tickVal = (a: Agent) => {
    if (a.fmt === 0) a.val = Math.max(1, a.val * (1 + (rnd() - 0.5) * 0.006));
    else if (a.fmt === 1) a.val = clampN(a.val + (rnd() - 0.5) * 0.4, -4.99, 4.99);
    else if (a.fmt === 2) a.val = clampN(a.val + (rnd() - 0.5) * 0.6, -9.9, 9.9);
    else a.val = clampN(a.val * (0.8 + rnd() * 0.4), 100, 48000);
    a.txt = fmtVal(a);
  };

  const spawn = (n: number) => {
    agents = [];
    for (let i = 0; i < n; i++) {
      const r = rnd();
      const fmt = r < 0.42 ? 0 : r < 0.68 ? 1 : r < 0.86 ? 2 : 3;
      const val = fmt === 0 ? 12 + rnd() * 880 : fmt === 1 ? (rnd() - 0.5) * 6 : fmt === 2 ? (rnd() - 0.5) * 12 : 100 + rnd() * rnd() * 30000;
      const a: Agent = {
        x: rnd() * W, y: rnd() * simH, vx: 0, vy: 0,
        ven: (rnd() * VEN.length) | 0, rho: 0.15 + rnd() * 0.85, phi: rnd() * 6.283, om: (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.2),
        sw: 4 + rnd() * 16, fmt, val, txt: '', tick: rnd() * 3, cd: rnd() * 3,
        hx: new Float32Array(TRAIL), hy: new Float32Array(TRAIL), hn: 0, ht: 0,
      };
      a.txt = fmtVal(a);
      agents.push(a);
    }
  };

  const sstep = (a: number, b: number, v: number) => {
    const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;

  const resize = () => {
    const nW = host.clientWidth || window.innerWidth;
    const nH = host.clientHeight || window.innerHeight;
    // bigger glyphs than the 2A field: quotes must stay readable (≈11px desktop, ≈8px at 390)
    cols = nW < 768 ? clampN(Math.round(nW / 4.7), 72, 150) : clampN(Math.round(nW / 6.4), 150, 250);
    const fs = nW / (cols * charRatio);
    rows = Math.min(160, Math.ceil(nH / fs) + 1);
    pre.style.setProperty('--fs', `${fs}px`);
    cw = nW / cols;
    ch = fs;
    srcK = new Uint8Array(cols * rows);
    srcG = new Uint8Array(cols * rows);
    U = new Float32Array(cols * rows);
    out = new Uint8Array(rows * (cols + 1) - 1);
    const sx = nW / W;
    W = nW;
    H = nH;
    // density by area, capped for phones / huge screens
    const n = clampN(Math.round((cols * rows) / 200), 56, 120);
    if (agents.length !== n) {
      simH = Math.max(160, (fB.bottom - fB.top) * nH);
      spawn(n);
    } else {
      agents.forEach((a) => {
        a.x *= sx;
        a.hn = 0;
      });
      syncSim();
    }
  };

  // framing: visible region (px) interpolated from the band (prog 0) to near-full viewport
  let fk = 0;
  const region = () => {
    fk = opts.isStatic ? 0 : sstep(0, 0.72, prog);
    return { top: mix(fA.top, fB.top, fk) * H, bot: mix(fA.bottom, fB.bottom, fk) * H };
  };

  /* ---------- market simulation (px) ---------- */
  const step = (t: number, dt: number) => {
    VEN.forEach((v) => {
      const nx = v.bx + 0.05 * Math.sin(t * 0.05 + v.ph);
      const ny = v.by + 0.08 * Math.sin(t * 0.043 + v.ph * 1.3);
      v.x = (0.04 + 0.92 * nx) * W;
      v.y = (0.08 + 0.84 * ny) * simH;
    });
    const sc = W / 1440;
    const ox = Math.max(80, W * 0.15), oy = simH * 0.3;
    const vmax = 70 * Math.max(0.55, sc);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.sw -= dt;
      if (a.sw < 0) {
        a.ven = (rnd() * VEN.length) | 0; // order flow: an agent moves to another venue
        a.sw = 8 + rnd() * 18;
      }
      a.phi += a.om * dt;
      const v = VEN[a.ven];
      const tx = v.x + Math.cos(a.phi) * a.rho * ox;
      const ty = v.y + Math.sin(a.phi) * a.rho * oy;
      let ax = (tx - a.x) * 0.55 - a.vx * 1.15;
      let ay = (ty - a.y) * 0.55 - a.vy * 1.15;
      // keep quotes from printing over each other (anisotropic: quotes are wide)
      for (let j = 0; j < agents.length; j++) {
        if (j === i) continue;
        const b = agents[j];
        const dx = (a.x - b.x) / (cw * 8.5), dy = (a.y - b.y) / (ch * 2.2);
        const d2 = dx * dx + dy * dy;
        if (d2 < 1 && d2 > 1e-6) {
          const f = (1 - d2) * 160;
          ax += (dx / Math.sqrt(d2)) * f;
          ay += (dy / Math.sqrt(d2)) * f * 0.6;
        }
      }
      a.vx += ax * dt;
      a.vy += ay * dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > vmax) {
        a.vx *= vmax / sp;
        a.vy *= vmax / sp;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      // trail history
      a.ht -= dt;
      if (a.ht <= 0) {
        a.ht = 0.42;
        a.hx.copyWithin(1, 0);
        a.hy.copyWithin(1, 0);
        a.hx[0] = a.x;
        a.hy[0] = a.y;
        a.hn = Math.min(TRAIL, a.hn + 1);
      }
      // live quotes
      a.tick -= dt;
      if (a.tick <= 0) {
        tickVal(a);
        a.tick = 1.6 + rnd() * 3.4;
      }
      a.cd -= dt;
    }
    // trades: two agents that meet exchange (a link + both quotes re-print)
    for (let k = trades.length - 1; k >= 0; k--) if (t - trades[k].t > TRADE_LIFE) trades.splice(k, 1);
    if (trades.length < 6) {
      for (let tries = 0; tries < 6; tries++) {
        const i = (rnd() * agents.length) | 0;
        const a = agents[i];
        if (a.cd > 0) continue;
        for (let j = 0; j < agents.length; j++) {
          const b = agents[j];
          if (j === i || b.cd > 0) continue;
          const dx = (a.x - b.x) / cw, dy = (a.y - b.y) / ch;
          if (dx * dx + dy * dy < 22 * 22 && Math.abs(dy) > 1.5) {
            trades.push({ a: i, b: j, t });
            a.cd = b.cd = 4 + rnd() * 6;
            tickVal(a);
            tickVal(b);
            break;
          }
        }
        break;
      }
    }
  };

  /* ---------- open layer: grid, trails, trade links, quotes ---------- */
  const put = (c: number, r: number, k: number, g: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    if (srcK[i] >= k && k !== K_TOKEN) return;
    srcK[i] = k;
    srcG[i] = g;
  };
  const buildOpen = (t: number) => {
    // the market is simulated at its full (end-of-runway) size; at scroll 0 the band shows the
    // middle of it and the runway slides it into place, so the field never has to catch up
    region();
    const c0 = ((fA.top + fA.bottom) / 2) * H, c1 = ((fB.top + fB.bottom) / 2) * H;
    const off = mix(c0, c1, fk) - simH / 2;
    const Y = (y: number) => y + off;
    srcK.fill(K_NONE);
    srcG.fill(SP);
    // a faint ledger grid: roughly square in px, so the lens visibly bends it
    const gx = 8, gy = Math.max(3, Math.round((8 * cw) / ch));
    for (let r = 2; r < rows; r += gy) for (let c = 4; c < cols; c += gx) {
      srcK[r * cols + c] = K_GRID;
      srcG[r * cols + c] = PUB_GRID;
    }
    for (const a of agents) {
      for (let h = 2; h < a.hn; h++) put(Math.floor(a.hx[h] / cw), Math.floor(Y(a.hy[h]) / ch), K_TRAIL, PUB_TRAIL);
    }
    for (const tr of trades) {
      const a = agents[tr.a], b = agents[tr.b];
      if (!a || !b) continue;
      const age = (t - tr.t) / TRADE_LIFE;
      const ac = a.x / cw, ar = Y(a.y) / ch, bc = b.x / cw, br = Y(b.y) / ch;
      const n = Math.ceil(Math.max(Math.abs(bc - ac), Math.abs(br - ar)));
      // the link draws in from both ends, then fades from the middle
      const grow = Math.min(1, age * 4);
      for (let s = 1; s < n; s++) {
        const f = s / n;
        const fromEnd = Math.min(f, 1 - f) * 2;
        if (fromEnd > grow || (age > 0.7 && fromEnd < (age - 0.7) / 0.3)) continue;
        if (s % 2) continue;
        put(Math.round(ac + (bc - ac) * f), Math.round(ar + (br - ar) * f), K_LINK, PUB_LINK);
      }
    }
    // quotes: one never prints over another (a 1-cell gap is kept), so every visible quote is legible
    for (const a of agents) {
      const r = Math.floor(Y(a.y) / ch);
      if (r < 0 || r >= rows) continue;
      const c0 = Math.round(a.x / cw - a.txt.length / 2);
      let free = true;
      for (let c = c0 - 1; c <= c0 + a.txt.length && free; c++) if (c >= 0 && c < cols && srcK[r * cols + c] === K_TOKEN) free = false;
      if (!free) continue;
      for (let k = 0; k < a.txt.length; k++) put(c0 + k, r, K_TOKEN, a.txt.charCodeAt(k));
    }
  };

  /* ---------- the lens ---------- */
  let lx = 0, ly = 0, la = 1, lb = 1, ln = 2;
  const placeLens = (t: number) => {
    const { top, bot } = region();
    const phone = W < 768;
    const bandH = (fA.bottom - fA.top) * H;
    // prog 0: a circle in the band, drifting across the open market
    const r0 = Math.min(bandH * 0.4, W * (phone ? 0.36 : 0.2));
    const open = opts.isStatic ? 1 : sstep(0.45, 1, reveal);
    const drift = opts.isStatic ? 0.3 : Math.sin(t * 0.13 - 0.6);
    const cx0 = W * 0.5 + drift * W * (phone ? 0.12 : 0.24);
    const cy0 = (fA.top + fA.bottom) * 0.5 * H + (opts.isStatic ? 0 : Math.sin(t * 0.09) * bandH * 0.05);
    // prog 1: a squircle covering ~85% of the viewport, the open market still visible around it
    const k = fk;
    lx = mix(cx0, W * 0.5, k);
    ly = mix(cy0, (top + bot) * 0.5, k);
    la = mix(r0, W * (phone ? 0.4 : 0.455), k) * mix(0.15, 1, open);
    lb = mix(r0, (bot - top) * (phone ? 0.4 : 0.46), k) * mix(0.15, 1, open);
    ln = mix(2, phone ? 3.4 : 4.4, k);
    return open;
  };

  const draw = (t: number) => {
    if (!cols) return;
    buildOpen(t);
    const open = placeLens(t);
    const n = ln, isCircle = n < 2.02;
    const c0 = Math.max(0, Math.floor((lx - la) / cw) - 1), c1 = Math.min(cols - 1, Math.ceil((lx + la) / cw) + 1);
    const r0 = Math.max(0, Math.floor((ly - lb) / ch) - 1), r1 = Math.min(rows - 1, Math.ceil((ly + lb) / ch) + 1);
    U.fill(9);
    const showLens = open > 0.02;
    if (showLens) for (let r = r0; r <= r1; r++) {
      const dy = Math.abs(((r + 0.5) * ch - ly) / lb);
      for (let c = c0; c <= c1; c++) {
        const dx = Math.abs(((c + 0.5) * cw - lx) / la);
        U[r * cols + c] = isCircle ? Math.sqrt(dx * dx + dy * dy) : Math.pow(Math.pow(dx, n) + Math.pow(dy, n), 1 / n);
      }
    }
    const shimmer = Math.floor(t * 7);
    let o = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const u = U[i];
        let g: number;
        if (u >= 1) {
          g = srcG[i]; // the open market, legible
        } else if (
          (c > 0 && U[i - 1] >= 1) || (c < cols - 1 && U[i + 1] >= 1) || (r > 0 && U[i - cols] >= 1) || (r < rows - 1 && U[i + cols] >= 1)
        ) {
          // the rim: one glyph thin, oriented along the contour
          const px = (c + 0.5) * cw - lx, py = (r + 0.5) * ch - ly;
          const nx = Math.sign(px) * Math.pow(Math.abs(px / la), n - 1) / la;
          const ny = Math.sign(py) * Math.pow(Math.abs(py / lb), n - 1) / lb;
          let th = Math.atan2(nx, -ny); // tangent (−ny, nx), y down
          th = ((th % Math.PI) + Math.PI) % Math.PI;
          const d = th / Math.PI;
          g = d < 0.125 || d >= 0.875 ? 45 /* - */ : d < 0.375 ? 92 /* \ */ : d < 0.625 ? 124 /* | */ : 47 /* / */;
        } else {
          // inside the glass: the centre is true, a ring toward the rim bends the grid (refraction),
          // then whatever is there is enciphered; the motion is the open market's, the content is not
          const s = u > 0.5 ? 1 - 0.13 * Math.sin(Math.PI * (u - 0.5) * 2) : 1;
          const sc = Math.floor((lx + ((c + 0.5) * cw - lx) * s) / cw);
          const sr = Math.floor((ly + ((r + 0.5) * ch - ly) * s) / ch);
          const j = sc >= 0 && sr >= 0 && sc < cols && sr < rows ? sr * cols + sc : -1;
          const k = j < 0 ? K_NONE : srcK[j];
          if (k === K_TOKEN) {
            const h = hash(sc, sr);
            g = HEAVY[(((h * 977) | 0) + (opts.isStatic ? 0 : Math.floor(shimmer * (0.5 + h)))) % HEAVY.length];
          } else if (k === K_TRAIL) g = hash(sc, sr) > 0.45 ? PRV_TRAIL : SP;
          else if (k === K_LINK) g = PRV_LINK;
          else if (k === K_GRID) g = PRV_GRID;
          else g = SP;
        }
        if (reveal < 1) {
          const hh = hash(c, r);
          if (hh > reveal) g = SP;
          else if (hh > reveal - 0.08 && g !== SP) g = HEAVY[(Math.random() * HEAVY.length) | 0];
        }
        out[o++] = g;
      }
      if (r < rows - 1) out[o++] = NL;
    }
    pre.textContent = dec.decode(out);
  };

  // time-driven loop (30 fps, paused off-screen / when covered / modal open)
  let t0 = 0;
  let tNow = 0;
  let tPrev = 0;
  const loop = opts.isStatic
    ? null
    : makeLoop(host, (now) => {
        if (!t0) t0 = now - 0.0001;
        tNow = now - t0;
        step(tNow, Math.min(0.1, Math.max(0, tNow - tPrev)));
        tPrev = tNow;
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
  // pre-warm the market so the first frame already has clusters, flows and trails
  const warm = () => {
    for (let k = 0; k < 150; k++) step(-5 + k / 30, 1 / 30);
  };

  resize();
  warm();
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
      syncSim();
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
