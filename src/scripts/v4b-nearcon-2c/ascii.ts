// v4B-NEARCON 2C (A5) ASCII fields (forked from 2A; only the hero object changes).
//  - Hero (2C): "visible flow, sealed value". A 3D stream of transaction tags (legible abstract
//    figures) passes through a lit frosted slab, the enclave; from its entry plane on, values come
//    out as live cipher. Time-driven from the first frame + scroll-linked (the slab grows round the
//    viewer until you stand inside it). Slab rendered offscreen with Three.js → luminance → density
//    ramp; edges and tags written straight into the grid. No pointer interaction. ~30 fps, paused
//    off-screen.
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
/* Hero (2C · A5): visible flow, sealed value                          */
/* ------------------------------------------------------------------ */
// "Open Markets, Private Money": a 3D stream of transaction packets crosses the stage in depth.
// Each packet is a tag of legible, abstract figures (digits . , + - %). In the middle stands the
// enclave, a lit frosted slab. Packets never stop: they pass through it, and from the entry plane
// on their values come out as cipher glyphs ({}[]<>/*;01) that keep re-rolling: still moving,
// still visibly part of the market, no longer readable.
// Glyph language carries the meaning: public = digits on black tags, private = dense cipher.
// Pipeline: Three.js renders the slab offscreen (one sample per cell) → luminance → density
// ramp; the slab edges are rasterised straight into the grid (one glyph thin, near-clipped);
// packets are camera-facing tags placed in 3D (perspective size, painter-sorted, z-tested against
// the edges) whose text is written per cell. The readable/sealed seam is exact per cell: a cell
// is sealed once its 3D point is past the entry plane. Packets seen through the slab are drawn
// sparse (frosted). TIME drives the flow from the first frame; SCROLL (setGrow) pushes the camera
// round and grows the slab until it envelops the viewer: at the end you stand inside the enclave,
// its far wall ~85% of the viewport, and every packet in view is alive but cipher.
const SEALG = '{}[]<>/*;01';
const CARD_W = 1.9;
const CARD_H = 0.42;
const FOV = 36;
const TAN = Math.tan((FOV * Math.PI) / 360);
const SLAB0 = { x: 0.6, y: 5.5, z: 6.5 };
const YAW0 = 0.46;
const PITCH0 = 0.07;
const YAW1 = 0.04;
const PITCH1 = 0.05;
const LX = 56; // loop length of each lane (world units)
const T_STATIC = 6.4; // reduced motion: the moment frozen (a packet mid-seal)
// few, clearly separated density bands for the lit slab
const SHADE: [number, string][] = [[0.07, ' '], [0.17, '.'], [0.3, ':'], [0.46, '-'], [0.64, '='], [9, '*']];
// lanes: normalised (y, z) inside the slab's cross-section, speed (units / s)
const LANES: [number, number, number][] = [
  [-0.92, 0.35, 0.82],
  [-0.62, -0.55, 0.95],
  [-0.34, 0.9, 0.74],
  [-0.12, -0.05, 1.05],
  [0.1, 0.6, 0.86],
  [0.34, -0.85, 0.78],
  [0.55, 0.2, 1.0],
  [0.8, -0.35, 0.9],
  [0.98, 0.8, 0.72],
  // portrait only: a tall screen needs more rows of traffic to stay a market
  [-0.78, -0.95, 0.88],
  [-0.23, 0.45, 0.8],
  [0.22, -0.4, 0.92],
  [0.67, 0.95, 0.76],
];
const LANES_WIDE = 9;
const fmtInt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export type HeroField = Field & {
  /** region (fractions of the host height) the object fits in at scroll progress 0 and 1 */
  setFrame: (a: { top: number; bottom: number }, b: { top: number; bottom: number }) => void;
};
export function createHeroField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): HeroField {
  const renderer = getRenderer();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-5, 7, 4);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(4, -2, 6);
  scene.add(key, fill, new THREE.AmbientLight(0xffffff, 0.03));
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), slabMat);
  scene.add(slab);

  // packets: deterministic abstract figures (no tickers, no real prices)
  let seed = 90210;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  type Card = { lane: number; off: number; id: number; l1: string; l2: string };
  const cards: Card[] = [];
  LANES.forEach((_, li) => {
    let x = rnd() * 6;
    while (x < LX - 4) {
      const cents = Math.round(Math.pow(10, 1 + rnd() * 3.4) * 100);
      const l1 = (rnd() < 0.55 ? '+' : '-') + fmtInt(Math.floor(cents / 100)) + '.' + String(cents % 100).padStart(2, '0');
      const pct = (rnd() < 0.5 ? '+' : '-') + (rnd() * 4.8).toFixed(2) + '%';
      const q = 'x' + (rnd() < 0.5 ? fmtInt(10 + Math.round(rnd() * 2400)) : (rnd() * 9).toFixed(3));
      cards.push({ lane: li, off: x, id: cards.length, l1, l2: `${pct} ${q}` });
      x += 5.2 + rnd() * 4.2;
    }
  });

  // scroll progress through the pinned runway (0 → 1)
  let prog = 0;
  // framing regions (fractions of the host height): band under the title → near full viewport
  let fA = { top: 0.42, bottom: 0.97 };
  let fB = { top: 0.1, bottom: 0.96 };

  let cols = 0;
  let rows = 0;
  let aspect = 1;
  let rt: THREE.WebGLRenderTarget | null = null;
  let buf = new Uint8Array(4);
  let out: string[] = [];
  let zb = new Float32Array(0);
  let reveal = opts.isStatic ? 1 : 0.3;

  const sstep = (a: number, b: number, v: number) => {
    const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  const geo = (a: number, b: number, k: number) => a * Math.pow(b / a, k);

  /* camera: orbit (yaw, pitch) at distance D round the origin; `off` shifts the image vertically
     (fraction of the viewport) so the composition sits in the framing region */
  const origin = new THREE.Vector3();
  const place = (yaw: number, pitch: number, D: number, off: number) => {
    camera.position.set(-D * Math.sin(yaw) * Math.cos(pitch), D * Math.sin(pitch), D * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(origin);
    const fw = cols * charRatio;
    camera.setViewOffset(fw, rows, 0, -off * rows, fw, rows);
    camera.updateMatrixWorld(true);
  };
  const pv = new THREE.Vector3();
  const bbox = (pts: THREE.Vector3[]) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      pv.copy(p).project(camera);
      const fx = (pv.x + 1) / 2, fy = (1 - pv.y) / 2;
      x0 = Math.min(x0, fx); x1 = Math.max(x1, fx);
      y0 = Math.min(y0, fy); y1 = Math.max(y1, fy);
    }
    return { x0, x1, y0, y1 };
  };
  const corners = (X: number, Y: number, z0: number, z1: number) => {
    const c: THREE.Vector3[] = [];
    for (const x of [-X / 2, X / 2]) for (const y of [-Y / 2, Y / 2]) for (const z of [z0, z1]) c.push(new THREE.Vector3(x, y, z));
    return c;
  };

  // start: the slab fits the band under the title. end: camera inside the grown slab, its far wall
  // filling the near-full-viewport region, packets ~2.8 rows tall at the flow's centre.
  let fit0 = { D: 20, off: 0 };
  let fit1 = { D: 24, off: 0, X: 30, Y: 16, zf: 36, zb: 10 };
  const refit = () => {
    if (!cols) return;
    const cA = corners(SLAB0.x, SLAB0.y, -SLAB0.z / 2, SLAB0.z / 2);
    const hA = (fA.bottom - fA.top) * 0.8;
    let D = 20;
    for (let i = 0; i < 3; i++) {
      place(YAW0, PITCH0, D, 0);
      const b = bbox(cA);
      D *= Math.max((b.y1 - b.y0) / hA, (b.x1 - b.x0) / 0.6);
    }
    place(YAW0, PITCH0, D, 0);
    let b = bbox(cA);
    fit0 = { D, off: (fA.top + fA.bottom) / 2 - (b.y0 + b.y1) / 2 };

    const D1 = Math.max((CARD_H * rows) / (2 * 2.8 * TAN), (5.5 * CARD_W) / (2 * TAN * aspect));
    const zb1 = 0.45 * D1;
    place(YAW1, PITCH1, D1, 0);
    let X = 1, Y = 1;
    const hB = (fB.bottom - fB.top) * 0.94;
    for (let i = 0; i < 3; i++) {
      b = bbox(corners(X, Y, -zb1, -zb1));
      Y *= hB / (b.y1 - b.y0);
      X *= 0.9 / (b.x1 - b.x0);
    }
    b = bbox(corners(X, Y, -zb1, -zb1));
    fit1 = { D: D1, off: (fB.top + fB.bottom) / 2 - (b.y0 + b.y1) / 2, X, Y, zf: 1.5 * D1, zb: zb1 };
  };

  const resize = () => {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || window.innerHeight;
    cols = W < 768 ? clampN(Math.round(W / 4), 92, 160) : clampN(Math.round(W / 5.6), 180, 270);
    const fs = W / (cols * charRatio);
    rows = Math.min(170, Math.ceil(H / fs) + 1);
    pre.style.setProperty('--fs', `${fs}px`);
    aspect = (cols * charRatio) / rows;
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(cols, rows, { depthBuffer: true });
    buf = new Uint8Array(cols * rows * 4);
    out = new Array<string>(cols * rows).fill(' ');
    zb = new Float32Array(cols * rows);
    refit();
  };

  // per-frame state: slab bounds (world), lane extents
  const box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
  let laneY = 1, laneZ0 = 0, laneZ1 = 0;
  let clear = 0; // 0 = frosted slab, 1 = clear (the viewer is closing in / inside)
  const pose = (t: number) => {
    const p = opts.isStatic ? 0 : prog;
    const gc = sstep(0, 0.92, p); // camera: three-quarter view → nearly square-on
    const gx = sstep(0.04, 0.88, p); // slab thickens: the entry plane sweeps upstream
    const gy = sstep(0.12, 0.97, p); // slab grows round the viewer
    const drift = opts.isStatic ? 0 : 1 - 0.8 * gc;
    const yaw = mix(YAW0, YAW1, gc) + Math.sin(t * 0.13) * 0.03 * drift;
    const pitch = mix(PITCH0, PITCH1, gc) + Math.sin(t * 0.09 + 1) * 0.012 * drift;
    const D = mix(fit0.D, fit1.D, gc);
    place(yaw, pitch, D, mix(fit0.off, fit1.off, gc));
    const X = geo(SLAB0.x, fit1.X, gx);
    const Y = geo(SLAB0.y, fit1.Y, gy);
    const zf = geo(SLAB0.z / 2, fit1.zf, gy);
    const zbk = geo(SLAB0.z / 2, fit1.zb, gy);
    box.x0 = -X / 2; box.x1 = X / 2;
    box.y0 = -Y / 2; box.y1 = Y / 2;
    box.z0 = -zbk; box.z1 = zf;
    slab.scale.set(X, Y, zf + zbk);
    slab.position.set(0, 0, (zf - zbk) / 2);
    // as the slab closes round the viewer its frosted faces go dark: inside, only the frame and
    // the sealed flow remain on black
    clear = sstep(0.4, 0.8, p);
    slabMat.color.setScalar(mix(0.254, 0.03, clear)); // linear ≈ #8a8a8a → near black
    laneY = (Y / 2) * 0.74;
    laneZ0 = -zbk * 0.78;
    laneZ1 = Math.min(zf * 0.78, camera.position.z - 0.55 * D);
  };

  const inBox = (x: number, y: number, z: number) => x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1 && z > box.z0 && z < box.z1;
  // does the sight line camera → (x,y,z) cross a face of the slab? (then the packet is frosted)
  const cam = new THREE.Vector3();
  let camIn = false;
  const crosses = (x: number, y: number, z: number) => {
    const pin = inBox(x, y, z);
    if (camIn !== pin) return true;
    if (camIn) return false;
    let t0 = 0, t1 = 1;
    const o = [cam.x, cam.y, cam.z], d = [x - cam.x, y - cam.y, z - cam.z];
    const lo = [box.x0, box.y0, box.z0], hi = [box.x1, box.y1, box.z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < lo[a] || o[a] > hi[a]) return false;
        continue;
      }
      let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    return true;
  };

  const cipher = (id: number, i: number, j: number, tc: number) => {
    const k = hash(id * 3.7 + i * 0.61, j * 1.9 + id);
    const step = Math.floor(tc * (0.3 + k * 1.6) + k * 17); // each glyph re-rolls at its own calm rate
    return SEALG[Math.floor(hash(i + step * 3.1, j + id * 5.3 + step * 0.7) * SEALG.length)];
  };
  // one packet cell: frame + legible figures, or the same frame filled with cipher
  const glyph = (cd: Card, i: number, j: number, w: number, h: number, sealed: boolean, tc: number) => {
    // sealed: the whole tag is a dense, re-rolling block in brackets
    if (sealed) return w >= 6 && (i === 0 || i === w - 1) ? (i === 0 ? '[' : ']') : cipher(cd.id, i, j, tc);
    // public: figures in brackets on black (rows without figures stay blank but opaque)
    const lines = h >= 2 && w >= 12 ? [cd.l1, cd.l2] : [cd.l1];
    const l0 = Math.floor((h - lines.length) / 2);
    const s = lines[j - l0];
    if (!s) return ' ';
    if (w >= 6 && (i === 0 || i === w - 1)) return i === 0 ? '[' : ']';
    const pad = w >= 6 ? 2 : Math.max(0, Math.floor((w - s.length) / 2));
    const k = i - pad;
    return k >= 0 && k < s.length ? s[k] : ' ';
  };
  // tag width: perspective size, but snug round its figures (same on both sides of the seam)
  const tagW = (cd: Card, w: number, h: number) => {
    const n = h >= 2 && w >= 12 ? Math.max(cd.l1.length, cd.l2.length) : cd.l1.length;
    return Math.min(w, n + 4);
  };

  const R = new THREE.Vector3();
  const U = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const wp = new THREE.Vector3();
  type Vis = { cd: Card; x: number; y: number; z: number; d: number; c0: number; r0: number; w: number; h: number; cpu: number; rpu: number };
  const vis: Vis[] = [];

  const drawEdge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    A.set(ax, ay, az).applyMatrix4(camera.matrixWorldInverse);
    B.set(bx, by, bz).applyMatrix4(camera.matrixWorldInverse);
    const nz = -0.25;
    if (A.z > nz && B.z > nz) return;
    if (A.z > nz) A.lerp(B, (nz - A.z) / (B.z - A.z));
    else if (B.z > nz) B.lerp(A, (nz - B.z) / (A.z - B.z));
    const da = -A.z, db = -B.z;
    A.applyMatrix4(camera.projectionMatrix);
    B.applyMatrix4(camera.projectionMatrix);
    const x0 = ((A.x + 1) / 2) * cols, y0 = ((1 - A.y) / 2) * rows;
    const x1 = ((B.x + 1) / 2) * cols, y1 = ((1 - B.y) / 2) * rows;
    let th = Math.atan2(y1 - y0, (x1 - x0) * charRatio);
    th = ((th % Math.PI) + Math.PI) % Math.PI;
    const dd = th / Math.PI;
    const gch = dd < 0.1 || dd >= 0.9 ? '-' : dd < 0.4 ? '\\' : dd < 0.6 ? '|' : '/';
    const steps = Math.min(4000, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5) + 1);
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const x = Math.round(x0 + (x1 - x0) * f);
      const y = Math.round(y0 + (y1 - y0) * f);
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const idx = y * cols + x;
      out[idx] = gch;
      zb[idx] = da + (db - da) * f;
    }
  };

  const draw = (t: number) => {
    if (!rt) return;
    pose(t);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, cols, rows, buf);
    renderer.setRenderTarget(null);
    const tc = opts.isStatic ? 0 : t;

    // 1 · lit slab → density bands
    for (let r = 0; r < rows; r++) {
      const y = rows - 1 - r;
      for (let c = 0; c < cols; c++) {
        const l = buf[(y * cols + c) * 4] / 255;
        let b = 0;
        while (l >= SHADE[b][0]) b++;
        // frosted: the faintest band is stippled, not a solid dot screen
        out[r * cols + c] = b === 1 && hash(c * 0.73, r * 1.37) > 0.55 ? ' ' : SHADE[b][1];
      }
    }
    zb.fill(Infinity);

    // 2 · slab edges (only those of a front-facing face, or all of them from inside)
    cam.copy(camera.position);
    camIn = inBox(cam.x, cam.y, cam.z);
    // a frosted slab hides its back edges; once it clears (viewer closing in) all of them show, so
    // the far wall's frame is already there when the near face sweeps past the viewer
    const all = camIn || clear > 0.5;
    const fx = [cam.x < box.x0, cam.x > box.x1];
    const fy = [cam.y < box.y0, cam.y > box.y1];
    const fz = [cam.z < box.z0, cam.z > box.z1];
    const X = [box.x0, box.x1], Y = [box.y0, box.y1], Z = [box.z0, box.z1];
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        if (all || fy[a] || fz[b]) drawEdge(X[0], Y[a], Z[b], X[1], Y[a], Z[b]);
        if (all || fx[a] || fz[b]) drawEdge(X[a], Y[0], Z[b], X[a], Y[1], Z[b]);
        if (all || fx[a] || fy[b]) drawEdge(X[a], Y[b], Z[0], X[a], Y[b], Z[1]);
      }

    // 3 · packets: camera-facing tags in 3D, far → near
    R.setFromMatrixColumn(camera.matrixWorld, 0);
    U.setFromMatrixColumn(camera.matrixWorld, 1);
    vis.length = 0;
    const nl = aspect < 0.9 ? LANES.length : LANES_WIDE;
    for (const cd of cards) {
      if (cd.lane >= nl) continue;
      const ln = LANES[cd.lane];
      const x = ((((cd.off + t * ln[2]) % LX) + LX) % LX) - LX / 2;
      const y = ln[0] * laneY;
      const z = mix(laneZ0, laneZ1, (ln[1] + 1) / 2);
      wp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      const d = -wp.z;
      if (d < 2) continue;
      const rpu = rows / (2 * d * TAN);
      const cpu = rpu / charRatio;
      const h = Math.max(1, Math.round(CARD_H * rpu));
      const w = tagW(cd, Math.max(2, Math.round(CARD_W * cpu)), h);
      if (h > 16) continue;
      wp.set(x, y, z).project(camera);
      const c0 = Math.round(((wp.x + 1) / 2) * cols - w / 2);
      const r0 = Math.round(((1 - wp.y) / 2) * rows - h / 2);
      if (c0 + w < 0 || c0 >= cols || r0 + h < 0 || r0 >= rows) continue;
      vis.push({ cd, x, y, z, d, c0, r0, w, h, cpu, rpu });
    }
    vis.sort((a, b) => b.d - a.d);
    for (const v of vis) {
      for (let j = 0; j < v.h; j++) {
        const r = v.r0 + j;
        if (r < 0 || r >= rows) continue;
        const bv = -(j + 0.5 - v.h / 2) / v.rpu;
        for (let i = 0; i < v.w; i++) {
          const c = v.c0 + i;
          if (c < 0 || c >= cols) continue;
          const idx = r * cols + c;
          if (v.d >= zb[idx]) continue;
          const av = (i + 0.5 - v.w / 2) / v.cpu;
          const px = v.x + R.x * av + U.x * bv;
          const py = v.y + R.y * av + U.y * bv;
          const pz = v.z + R.z * av + U.z * bv;
          const ch = glyph(v.cd, i, j, v.w, v.h, px > box.x0, tc);
          if (clear < 0.98 && crosses(px, py, pz)) {
            // seen through the frosted slab: a sparse, unreadable trace of the packet
            if (ch !== ' ' && hash(c * 1.31, r * 2.17) < 0.3 + 0.7 * clear) out[idx] = ch;
            continue;
          }
          out[idx] = ch;
          zb[idx] = v.d;
        }
      }
    }

    // 4 · intro reveal + write
    let s = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let ch = out[r * cols + c];
        if (reveal < 1) {
          const hh = hash(c, r);
          if (hh > reveal) ch = ' ';
          else if (hh > reveal - 0.08 && ch !== ' ') ch = SCR[(Math.random() * SCR.length) | 0];
        }
        s += ch;
      }
      if (r < rows - 1) s += '\n';
    }
    pre.textContent = s;
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
      draw(T_STATIC);
    });
  };
  const now = () => (opts.isStatic ? T_STATIC : tNow);

  resize();
  draw(now());
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw(now());
    },
    render: () => draw(now()),
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
      refit();
      schedule();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      loop?.stop();
      rt?.dispose();
      slab.geometry.dispose();
      slabMat.dispose();
      releaseRenderer();
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
