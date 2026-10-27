// Hero: a strict grid of square modules. Each module ray-casts a slowly rotating
// enclave (a solid core slab inside a bar frame); the hit shade sets the module size,
// so the 3D form reads as halftone pixels, never as a solid.
import { C, Batch, bayer, hash, clamp, fit, surface, lerp, type Surface } from './common';

type V3 = [number, number, number];
type Box = { c: V3; h: V3; kind: 0 | 1 }; // 0 core, 1 frame

// frame: a clean box outline around the core slab (12 bars, ~1 module thick)
const FX = 1.0;
const FY = 0.66;
const FZ = 1.0;
const T = 0.055;
const FRAME: Box[] = [];
for (const sy of [-1, 1]) for (const sz of [-1, 1]) FRAME.push({ c: [0, sy * FY, sz * FZ], h: [FX + T, T, T], kind: 1 });
for (const sx of [-1, 1]) for (const sz of [-1, 1]) FRAME.push({ c: [sx * FX, 0, sz * FZ], h: [T, FY, T], kind: 1 });
for (const sx of [-1, 1]) for (const sy of [-1, 1]) FRAME.push({ c: [sx * FX, sy * FY, 0], h: [T, T, FZ], kind: 1 });
const CORE: Box = { c: [0, 0, 0], h: [0.68, 0.36, 0.68], kind: 0 };
const BOUND: V3 = [FX + T, FY + T, FZ + T];
const DEEP = '#00875A'; // darker step of the brand green for the shaded side

const L: V3 = (() => {
  const v: V3 = [-0.55, 0.75, 0.62];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

// rotation matrix rows (object -> world) for yaw then pitch
function rot(yaw: number, pitch: number, out: number[]) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  // R = Rx(pitch) * Ry(yaw)
  out[0] = cy; out[1] = 0; out[2] = sy;
  out[3] = sx * sy; out[4] = cx; out[5] = -sx * cy;
  out[6] = -cx * sy; out[7] = sx; out[8] = cx * cy;
}

let hitT = 0;
let hitAxis = 0;
let hitSign = 0;
/** slab test; returns true and sets hitT/axis/sign when the ray enters the box before tBest */
function slab(o: V3, d: V3, c: V3, h: V3, tBest: number): boolean {
  let tn = -Infinity, tf = Infinity, ax = 0, sg = 0;
  for (let i = 0; i < 3; i++) {
    const di = Math.abs(d[i]) < 1e-9 ? 1e-9 : d[i];
    const inv = 1 / di;
    let t1 = (c[i] - h[i] - o[i]) * inv;
    let t2 = (c[i] + h[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tn) { tn = t1; ax = i; sg = s; }
    if (t2 < tf) tf = t2;
    if (tn > tf || tf < 0) return false;
  }
  if (tn < 0 || tn >= tBest) return false;
  hitT = tn; hitAxis = ax; hitSign = sg;
  return true;
}

export type Field = { start(): void; stop(): void; setPaused(p: boolean): void; renderStatic(): void; resize(): void };

export function createField(cv: HTMLCanvasElement, opts: { reduce: boolean; fine: boolean }): Field | null {
  const s = surface(cv);
  if (!s) return null;
  const S: Surface = s;
  const batch = new Batch();
  const R = new Array(9).fill(0);
  const o: V3 = [0, 0, 0], d: V3 = [0, 0, 0];
  const ptr = { x: -9999, y: -9999, sx: -9999, sy: -9999, on: 0, k: 0, tx: 0, ttx: 0 };
  let raf = 0, running = false, paused = false, visible = true;
  let t = 0, last = 0, build = opts.reduce ? 1 : 0;

  if (opts.fine && !opts.reduce) {
    const host = cv.parentElement!;
    host.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.on = 1;
      ptr.ttx = (e.clientX / window.innerWidth) * 2 - 1;
    }, { passive: true });
    host.addEventListener('pointerleave', () => { ptr.on = 0; ptr.ttx = 0; });
  }

  function layout() {
    const w = S.w, h = S.h;
    if (w >= 1024) return { cell: w >= 1600 ? 15 : 14, cx: w * 0.72, cy: h * 0.54, sc: Math.min(w * 0.165, h * 0.25), mask: 0 as const };
    if (w >= 768) return { cell: 12, cx: w * 0.68, cy: h * 0.3, sc: Math.min(w * 0.2, h * 0.16), mask: 1 as const };
    return { cell: 10, cx: w * 0.6, cy: h * 0.28, sc: Math.min(w * 0.3, h * 0.165), mask: 1 as const };
  }

  function frame() {
    if (!fit(S)) return;
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    const { cell, cx, cy, sc, mask } = layout();
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const ox0 = (w - (cols - 1) * cell) / 2;
    const oy0 = (h - (rows - 1) * cell) / 2;

    // pose
    ptr.tx = lerp(ptr.tx, ptr.ttx, 0.04);
    const yaw = t * 0.18 + 0.62 + ptr.tx * 0.3;
    const pitch = 0.44; // fixed ~25° tilt: top face always in view
    rot(yaw, pitch, R);
    // near-isometric: far camera, almost parallel rays
    const D = 40;
    // camera origin in object space = R^T * (0,0,D)
    o[0] = R[6] * D; o[1] = R[7] * D; o[2] = R[8] * D;

    // pointer (smoothed), opening radius
    ptr.k = lerp(ptr.k, ptr.on, 0.08);
    if (ptr.sx < -9000) { ptr.sx = ptr.x; ptr.sy = ptr.y; }
    ptr.sx = lerp(ptr.sx, ptr.x, 0.18);
    ptr.sy = lerp(ptr.sy, ptr.y, 0.18);
    const PR = 120;

    for (let iy = 0; iy < rows; iy++) {
      const gy = oy0 + iy * cell;
      for (let ix = 0; ix < cols; ix++) {
        const gx = ox0 + ix * cell;
        const hsh = hash(ix, iy);
        const appear = clamp((build * 1.45 - hsh) * 3.2);
        if (appear <= 0) continue;

        // pointer opening
        let px = gx, py = gy, open = 0;
        if (ptr.k > 0.01) {
          const dx = gx - ptr.sx, dy = gy - ptr.sy;
          const dd = Math.hypot(dx, dy);
          if (dd < PR) {
            const k = 1 - dd / PR;
            open = k * (2 - k) * ptr.k;
            const inv = dd > 0.001 ? 1 / dd : 0;
            px += dx * inv * open * 34;
            py += dy * inv * open * 34;
          }
        }

        // ray through the module centre (sample at grid position, not displaced)
        const u = (gx - cx) / sc;
        const v = -(gy - cy) / sc;
        // world dir (u, v, -D) -> object space R^T
        d[0] = R[0] * u + R[3] * v - R[6] * D;
        d[1] = R[1] * u + R[4] * v - R[7] * D;
        d[2] = R[2] * u + R[5] * v - R[8] * D;

        let best = Infinity, kind = -1, nAx = 0, nSg = 0;
        if (slab(o, d, [0, 0, 0], BOUND, best)) {
          for (let b = 0; b < FRAME.length; b++) {
            const bx = FRAME[b];
            if (slab(o, d, bx.c, bx.h, best)) { best = hitT; kind = 1; nAx = hitAxis; nSg = hitSign; }
          }
          if (slab(o, d, CORE.c, CORE.h, best)) { best = hitT; kind = 0; nAx = hitAxis; nSg = hitSign; }
        }

        if (kind >= 0) {
          // world normal = R * n (n = sign on axis)
          const nx = R[nAx] * nSg, ny = R[3 + nAx] * nSg, nz = R[6 + nAx] * nSg;
          const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const th = bayer(ix, iy);
          let key: string;
          let size: number;
          if (kind === 0) {
            // three faces, three tones: top lime, lit front green, shaded side deep green
            if (ny > 0.5) { key = th < 0.88 ? C.lime : C.lime + '|0.55'; size = 0.9; }
            else if (nx < 0) { key = th < 0.2 + lam ? C.green : C.green + '|0.55'; size = 0.66 + 0.26 * lam; }
            else { key = th < 0.7 ? DEEP : DEEP + '|0.6'; size = 0.58 + 0.2 * lam; }
          } else {
            key = th < 0.75 ? C.w400 : C.w500;
            size = 0.62;
          }
          size *= cell * appear * (1 - open);
          batch.add(key, Math.round(px), Math.round(py), Math.round(size));
          // the opened gap shows the background grid underneath
          if (open > 0.15) batch.add(C.dark, gx, gy, Math.round(cell * 0.26 * open));
        } else {
          // background: faint rows of modules, a slow wave travels through them
          let m = 1;
          if (mask === 0) m = clamp((gx / w - 0.4) / 0.2);
          else m = 1 - clamp((gy / h - 0.42) / 0.14);
          if (m <= 0.02) continue;
          const wave = 0.5 + 0.5 * Math.sin(ix * 0.32 + iy * 0.16 - t * 0.8);
          const size = cell * (0.14 + 0.2 * wave * wave + 0.12 * open) * m * appear;
          batch.add(wave > 0.93 && hsh > 0.82 ? C.green + '|0.5' : C.dark, Math.round(px), Math.round(py), Math.round(size));
        }
      }
    }
    batch.flush(ctx);
  }

  function loop(now: number) {
    raf = 0;
    if (!running || paused || !visible || document.hidden) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    t += dt;
    if (build < 1) build = Math.min(1, build + dt / 1.1);
    frame();
    raf = requestAnimationFrame(loop);
  }
  const kick = () => {
    if (!raf && running && !paused && visible && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  };

  const io = new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    kick();
  });
  io.observe(cv);
  document.addEventListener('visibilitychange', kick);

  return {
    start() { running = true; kick(); },
    stop() { running = false; },
    setPaused(p) { paused = p; kick(); },
    renderStatic() { build = 1; t = 2.2; frame(); },
    resize() { if (!running || paused) frame(); },
  };
}
