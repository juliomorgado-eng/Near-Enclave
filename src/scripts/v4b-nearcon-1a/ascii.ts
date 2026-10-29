// v4B-NEARCON 1A ASCII fields (higher resolution: more columns, smaller glyphs).
//  - Hero: a coin with an embossed "$" sealed in a wireframe cube, rendered offscreen with Three.js,
//    edge-detected (Sobel → / \ | - _) for crisp silhouettes,
//    luminance sampled (2×2 supersampled) into a density ramp, written into a <pre>.
//    No pointer interaction. ~30 fps, paused off-screen.
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
/* Hero: a coin with an embossed "$" sealed inside a wireframe cube     */
/* ------------------------------------------------------------------ */
// "Open Markets, Private Money": money (a thick coin, raised "$") held inside an open,
// see-through enclave (a cube drawn as edges only), with a few small coins drifting outside.
// Legibility: hard key light on black, ramp from blank, and Sobel edge detection on the
// luminance grid that writes directional glyphs ( / \ | - _ ) along silhouettes and the "$".
const EDGE_T = 0.42;
// few, clearly separated density bands: background · face · rim · "$"
const BANDS: [number, string][] = [[0.06, ' '], [0.2, '.'], [0.36, ':'], [0.52, '-'], [0.66, '='], [0.8, '*'], [0.92, '0'], [9, '{']];
export function createHeroField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): Field {
  const renderer = getRenderer();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  // hard key from upper left/front, faint rim from the right, almost no ambient
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-3, 4, 6);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(5, -1, -2);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.02));

  const group = new THREE.Group(); // placement
  scene.add(group);

  // enclave: the cube is not rendered in WebGL. Its 8 corners are projected each frame and its
  // 12 edges rasterised straight into the glyph grid (slope → - | / \), so they stay one glyph thin
  // and crisp instead of turning into double-outlined struts under the edge detector.
  const cube = new THREE.Object3D();
  group.add(cube);
  const S = 3.3;
  const h = S / 2;
  const corners: THREE.Vector3[] = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push(new THREE.Vector3(x, y, z));
  const cubeEdges: [number, number][] = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    const d = corners[a].clone().sub(corners[b]);
    if (Math.abs(d.length() - S) < 1e-3) cubeEdges.push([a, b]);
  }
  const proj = corners.map(() => new THREE.Vector3());
  cube.rotation.set(0.32, 0.62, 0);

  // coin: thick cylinder + raised rim ring on both faces + embossed "$" on the front
  const coin = new THREE.Group();
  group.add(coin);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0 });
  // the "$" and rim ring glow a little, so they stay the brightest band at any angle
  const markMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8a8a8a, roughness: 0.35 });
  const R0 = 1.32, T = 0.34;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0, T, 72, 1), new THREE.MeshStandardMaterial({ color: 0x5c5c5c, roughness: 0.6 }));
  disc.rotation.x = Math.PI / 2; // face looks at +z
  coin.add(disc);
  const ringGeo = new THREE.TorusGeometry(R0 * 0.9, 0.05, 8, 72);
  for (const zf of [1, -1]) {
    const ring = new THREE.Mesh(ringGeo, markMat);
    ring.position.z = (zf * T) / 2;
    coin.add(ring);
  }
  // "$": an S stroke (two arcs) as a tube + a vertical bar, raised off the face
  const sPts: THREE.Vector3[] = [];
  const r = 0.34;
  for (let i = 0; i <= 24; i++) {
    const a = THREE.MathUtils.lerp(Math.PI * 0.15, Math.PI * 1.5, i / 24); // upper bowl, counter-clockwise
    sPts.push(new THREE.Vector3(Math.cos(a) * r, r + Math.sin(a) * r, 0));
  }
  for (let i = 1; i <= 24; i++) {
    const a = THREE.MathUtils.lerp(Math.PI * 0.5, -Math.PI * 0.85, i / 24); // lower bowl, clockwise
    sPts.push(new THREE.Vector3(Math.cos(a) * r, -r + Math.sin(a) * r, 0));
  }
  const dollar = new THREE.Group();
  dollar.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sPts), 96, 0.13, 8, false), markMat));
  dollar.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.95, 0.22), markMat));
  for (const zf of [1, -1]) {
    const d = zf === 1 ? dollar : dollar.clone();
    d.position.z = (zf * T) / 2 + zf * 0.04;
    if (zf === -1) d.rotation.y = Math.PI; // reads correctly from the back too
    coin.add(d);
  }

  // open market: a few small coins drifting outside the cube
  const small: { m: THREE.Mesh; a: number; y: number; rr: number; s: number }[] = [];
  const smallGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 32);
  [0, 1, 2].forEach((i) => {
    const m = new THREE.Mesh(smallGeo, coinMat);
    group.add(m);
    small.push({ m, a: i * 2.1 + 0.4, y: [-0.9, 0.7, 1.4][i], rr: 2.75 + i * 0.12, s: 0.07 + i * 0.015 });
  });

  let cols = 0;
  let rows = 0;
  let rt: THREE.WebGLRenderTarget | null = null;
  let buf = new Uint8Array(4);
  let L = new Float32Array(0);
  let reveal = opts.isStatic ? 1 : 0;
  let t0 = 0;
  // object centre/radius in cells, to keep the grain off the object
  let oc = { x: 0, y: 0, rx: 1, ry: 1 };

  const resize = () => {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || window.innerHeight;
    const ratio = charRatio;
    cols = W < 768 ? clampN(Math.round(W / 4), 96, 180) : clampN(Math.round(W / 7), 160, 240);
    const fs = W / (cols * ratio);
    rows = Math.min(140, Math.ceil(H / fs) + 1);
    pre.style.setProperty('--fs', `${fs}px`);
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(cols * 2, rows * 2, { depthBuffer: true });
    buf = new Uint8Array(cols * rows * 16);
    L = new Float32Array(cols * rows);
    const aspect = (cols * ratio) / rows;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const halfW = halfH * aspect;
    // scene half-extent ≈ 2.7 (cube corners + drifting coins), scaled into the frame
    let s: number;
    if (aspect > 1.0) {
      // landscape: fill most of the right half, lower right, fully in frame
      s = Math.min(halfW * 0.5 * 0.94, halfH * 0.84) / 2.7;
      group.position.set(halfW * 0.5, -halfH * 0.12, 0);
    } else {
      // portrait: smaller, in the band under the text
      s = Math.min((halfW * 0.86) / 2.7, halfH * 0.34 / 2.7);
      group.position.set(0, -halfH * 0.6, 0);
    }
    group.scale.setScalar(s);
    const p = group.position.clone().project(camera);
    oc = {
      x: ((p.x + 1) / 2) * cols,
      y: ((1 - p.y) / 2) * rows,
      rx: (2.6 * s / halfW) * cols * 0.5,
      ry: (2.6 * s / halfH) * rows * 0.5,
    };
  };

  const pose = (t: number) => {
    // coin swings slowly on Y so the face and "$" stay readable; a slight tilt shows the rim band
    coin.rotation.set(0.14 + Math.sin(t * 0.21) * 0.05, Math.sin(t * 0.3) * 0.5, -0.06);
    cube.rotation.y = 0.62 + t * 0.05;
    small.forEach((o) => {
      const a = o.a + t * o.s;
      o.m.position.set(Math.cos(a) * o.rr, o.y + Math.sin(t * 0.4 + o.a) * 0.08, Math.sin(a) * o.rr * 0.6);
      o.m.rotation.set(Math.PI / 2 + 0.3, a, 0);
    });
  };

  const EDGE_H = '-';
  const draw = (t: number) => {
    if (!rt) return;
    pose(t);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, cols * 2, rows * 2, buf);
    renderer.setRenderTarget(null);
    const W2 = cols * 2;
    // project the cube corners to cell space (x right, y down) + depth
    group.updateMatrixWorld(true);
    const coinZ = coin.getWorldPosition(new THREE.Vector3()).project(camera).z;
    corners.forEach((v, i) => {
      proj[i].copy(v).applyMatrix4(cube.matrixWorld).project(camera);
    });
    // luminance per cell (2×2 supersampled), rows top→bottom
    for (let r = 0; r < rows; r++) {
      const y = (rows - 1 - r) * 2;
      for (let c = 0; c < cols; c++) {
        const i0 = (y * W2 + c * 2) * 4;
        const i1 = i0 + W2 * 4;
        L[r * cols + c] = (buf[i0] + buf[i0 + 4] + buf[i1] + buf[i1 + 4]) / 1020;
      }
    }
    // cube edge glyphs: front edges sit over the coin, back edges only where the coin isn't
    const line = new Array<string>(cols * rows).fill('');
    for (const [a, b] of cubeEdges) {
      const A = proj[a], B = proj[b];
      const ax = ((A.x + 1) / 2) * cols, ay = ((1 - A.y) / 2) * rows;
      const bx = ((B.x + 1) / 2) * cols, by = ((1 - B.y) / 2) * rows;
      const front = (A.z + B.z) / 2 < coinZ;
      let th = Math.atan2(by - ay, (bx - ax) * charRatio);
      th = ((th % Math.PI) + Math.PI) % Math.PI;
      const d = th / Math.PI;
      const gch = d < 0.1 || d >= 0.9 ? '-' : d < 0.4 ? '\\' : d < 0.6 ? '|' : '/';
      const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 1.5) + 1;
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(ax + ((bx - ax) * k) / steps);
        const y = Math.round(ay + ((by - ay) * k) / steps);
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const idx = y * cols + x;
        if (front || L[idx] < 0.06) line[idx] = gch;
      }
    }
    proj.forEach((P) => {
      const x = Math.round(((P.x + 1) / 2) * cols), y = Math.round(((1 - P.y) / 2) * rows);
      if (x >= 0 && y >= 0 && x < cols && y < rows && (P.z < coinZ || L[y * cols + x] < 0.06)) line[y * cols + x] = '+';
    });
    const at = (c: number, r: number) => L[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
    let out = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const l = L[r * cols + c];
        // Sobel
        const gx = at(c + 1, r - 1) + 2 * at(c + 1, r) + at(c + 1, r + 1) - at(c - 1, r - 1) - 2 * at(c - 1, r) - at(c - 1, r + 1);
        const gy = at(c - 1, r + 1) + 2 * at(c, r + 1) + at(c + 1, r + 1) - at(c - 1, r - 1) - 2 * at(c, r - 1) - at(c + 1, r - 1);
        const g = Math.hypot(gx, gy);
        let ch: string;
        if (line[r * cols + c]) ch = line[r * cols + c];
        // silhouette edges only: the darker side (against the gradient) must be background, so
        // the "$" reads as dense fill on a sparse face instead of a double outline
        else if (g > EDGE_T && l > 0.06 && at(c - Math.round((gx / g) * 1.5), r - Math.round((gy / g) * 1.5)) < 0.06) {
          // edge tangent (screen space, y down), corrected for the tall glyph cell
          let th = Math.atan2(gy, gx * charRatio) + Math.PI / 2;
          th = ((th % Math.PI) + Math.PI) % Math.PI;
          const d = th / Math.PI; // 0..1
          ch = d < 0.125 || d >= 0.875 ? (gy < 0 ? '_' : EDGE_H) : d < 0.375 ? '\\' : d < 0.625 ? '|' : '/';
        } else if (l < 0.06) {
          // background: sparse grain, kept away from the object
          const ex = (c - oc.x) / oc.rx;
          const ey = (r - oc.y) / oc.ry;
          const away = ex * ex + ey * ey > 1.15;
          if (away) {
            const w = Math.sin(c * 0.11 + t * 0.4 + Math.sin(r * 0.17 - t * 0.3) * 2) * Math.cos(r * 0.09 - t * 0.22);
            const v = 0.5 + 0.36 * w + (hash(c, r) - 0.5) * 0.4;
            ch = v > 0.88 ? ':' : v > 0.72 ? '.' : ' ';
          } else ch = ' ';
        } else {
          let b = 0;
          while (l >= BANDS[b][0]) b++;
          ch = BANDS[b][1];
        }
        // intro: glyphs decrypt in by a per-cell threshold
        if (reveal < 1) {
          const hh = hash(c, r);
          if (hh > reveal) ch = ' ';
          else if (hh > reveal - 0.08 && ch !== ' ') ch = SCR[(Math.random() * SCR.length) | 0];
        }
        out += ch;
      }
      if (r < rows - 1) out += '\n';
    }
    pre.textContent = out;
  };

  const loop = opts.isStatic
    ? null
    : makeLoop(host, (now) => {
        if (!t0) t0 = now;
        draw(now - t0);
      }, 1000 / FRAME);

  resize();
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw(opts.isStatic ? 1.2 : performance.now() / 1000 - t0);
    },
    render: () => draw(1.2),
    setReveal: (v) => (reveal = v),
    dispose: () => {
      loop?.stop();
      rt?.dispose();
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
