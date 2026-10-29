// Hero: a strict grid of small square modules ray-casting one large open frame (12 bars,
// no core). "NEAR Enclave 2027" is set vertically on the frame's front face: the words are
// rendered once to an offscreen mask and every module that hits the face samples it, so the
// type is made of the same modules as the frame. The pose only sways a few degrees around a
// near-frontal yaw so the face (and the type) stays legible.
import { C, Batch, bayer, hash, clamp, fit, surface, lerp, cellFor, makeLoop, type Surface } from './common';

type V3 = [number, number, number];
type Box = { c: V3; h: V3 };

// tall open box; FX:FY is also the aspect of the type mask
const FX = 0.72;
const FY = 1.0;
const FZ = 0.72;
const T = 0.03;
const FRAME: Box[] = [];
for (const sy of [-1, 1]) for (const sz of [-1, 1]) FRAME.push({ c: [0, sy * FY, sz * FZ], h: [FX + T, T, T] });
for (const sx of [-1, 1]) for (const sz of [-1, 1]) FRAME.push({ c: [sx * FX, 0, sz * FZ], h: [T, FY, T] });
for (const sx of [-1, 1]) for (const sy of [-1, 1]) FRAME.push({ c: [sx * FX, sy * FY, 0], h: [T, T, FZ] });
const BOUND: V3 = [FX + T, FY + T, FZ + T];
const DEEP = '#00875A';

const L: V3 = (() => {
  const v: V3 = [-0.55, 0.75, 0.62];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

function rot(yaw: number, pitch: number, out: number[]) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  out[0] = cy; out[1] = 0; out[2] = sy;
  out[3] = sx * sy; out[4] = cx; out[5] = -sx * cy;
  out[6] = -cx * sy; out[7] = sx; out[8] = cx * cy;
}

let hitT = 0, hitAxis = 0, hitSign = 0;
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

/* ---------- type mask: three words, rotated to read bottom-to-top ---------- */
const MH = 600;
const MW = Math.round((MH * FX) / FY);
type Mask = { cov: Float32Array; word: Uint8Array };
function makeMask(words: string[]): Mask {
  const cv = document.createElement('canvas');
  cv.width = MW;
  cv.height = MH;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const fam = '"Space Grotesk Variable", "Inter Tight Variable", system-ui, sans-serif';
  // fit: longest word spans 86 % of the face height, three lines span 88 % of its width
  ctx.font = `600 100px ${fam}`;
  const wMax = Math.max(...words.map((w) => ctx.measureText(w).width));
  const fs = Math.min((MH * 0.86 * 100) / wMax, (MW * 0.88) / (words.length * 0.86));
  ctx.font = `600 ${fs}px ${fam}`;
  ctx.textBaseline = 'alphabetic';
  const lh = fs * 0.86;
  const block = lh * words.length;
  const word = new Uint8Array(MW * MH);
  const cov = new Float32Array(MW * MH);
  words.forEach((w, i) => {
    ctx.clearRect(0, 0, MW, MH);
    ctx.save();
    ctx.translate(MW / 2, MH / 2);
    ctx.rotate(-Math.PI / 2);
    // local x runs up the face, local y runs right; first word sits on the left
    ctx.fillStyle = '#fff';
    const y = -block / 2 + lh * (i + 1) - fs * 0.13;
    ctx.fillText(w, -MH * 0.43, y);
    ctx.restore();
    const px = ctx.getImageData(0, 0, MW, MH).data;
    for (let k = 0; k < MW * MH; k++) {
      const a = px[k * 4 + 3] / 255;
      if (a > cov[k]) { cov[k] = a; word[k] = i; }
    }
  });
  return { cov, word };
}

export type Field = { start(): void; setPaused(p: boolean): void; renderStatic(): void; resize(): void };

export function createField(cv: HTMLCanvasElement, opts: { reduce: boolean; fine: boolean; words: string[] }): Field | null {
  const s = surface(cv);
  if (!s) return null;
  const S: Surface = s;
  const batch = new Batch();
  const R = new Array(9).fill(0);
  const o: V3 = [0, 0, 0], d: V3 = [0, 0, 0];
  const ptr = { x: -9999, y: -9999, sx: -9999, sy: -9999, on: 0, k: 0, tx: 0, ttx: 0 };
  // entry: the first frame already shows half the modules; full in 0.6 s
  let t = 0, build = opts.reduce ? 1 : 0.35;
  let mask = makeMask(opts.words);
  // the display face may still be loading: re-raster the mask once it is in
  document.fonts?.load('600 100px "Space Grotesk Variable"').then(() => {
    mask = makeMask(opts.words);
    if (!loop.on) frame();
  }).catch(() => {});

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
    const cell = cellFor(w);
    // desktop: the frame stands on the right and bleeds off the top; copy keeps the left
    if (w >= 1024) return { cell, cx: w * 0.73, cy: h * 0.47, sc: Math.min(h * 0.38, w * 0.25), mask: 0 as const };
    if (w >= 768) return { cell, cx: w * 0.66, cy: h * 0.3, sc: Math.min(h * 0.24, w * 0.3), mask: 1 as const };
    return { cell, cx: w * 0.55, cy: h * 0.295, sc: Math.min(h * 0.205, w * 0.46), mask: 1 as const };
  }

  function frame() {
    if (!fit(S)) return;
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    const { cell, cx, cy, sc, mask: mk } = layout();
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const ox0 = (w - (cols - 1) * cell) / 2;
    const oy0 = (h - (rows - 1) * cell) / 2;

    ptr.tx = lerp(ptr.tx, ptr.ttx, 0.04);
    const yaw = 0.4 + Math.sin(t * 0.32) * 0.1 + ptr.tx * 0.12;
    const pitch = 0.3 + Math.sin(t * 0.21 + 1) * 0.04;
    rot(yaw, pitch, R);
    const D = 40;
    o[0] = R[6] * D; o[1] = R[7] * D; o[2] = R[8] * D;

    ptr.k = lerp(ptr.k, ptr.on, 0.08);
    if (ptr.sx < -9000) { ptr.sx = ptr.x; ptr.sy = ptr.y; }
    ptr.sx = lerp(ptr.sx, ptr.x, 0.18);
    ptr.sy = lerp(ptr.sy, ptr.y, 0.18);
    const PR = 110;
    // light sweep travelling up the type
    const sweep = ((t * 0.16) % 1.6) - 0.3;
    const { cov, word } = mask;

    for (let iy = 0; iy < rows; iy++) {
      const gy = oy0 + iy * cell;
      for (let ix = 0; ix < cols; ix++) {
        const gx = ox0 + ix * cell;
        const hsh = hash(ix, iy);
        const appear = clamp((build * 1.5 - hsh * 0.5) * 2.2 - 0.6);
        if (appear <= 0) continue;

        let px = gx, py = gy, open = 0;
        if (ptr.k > 0.01) {
          const dx = gx - ptr.sx, dy = gy - ptr.sy;
          const dd = Math.hypot(dx, dy);
          if (dd < PR) {
            const k = 1 - dd / PR;
            open = k * (2 - k) * ptr.k;
            const inv = dd > 0.001 ? 1 / dd : 0;
            px += dx * inv * open * 26;
            py += dy * inv * open * 26;
          }
        }

        const u = (gx - cx) / sc;
        const v = -(gy - cy) / sc;
        d[0] = R[0] * u + R[3] * v - R[6] * D;
        d[1] = R[1] * u + R[4] * v - R[7] * D;
        d[2] = R[2] * u + R[5] * v - R[8] * D;

        let best = Infinity, hit = false, nAx = 0, nSg = 0, inBound = false;
        if (slab(o, d, [0, 0, 0], BOUND, best)) {
          inBound = true;
          for (let b = 0; b < FRAME.length; b++) {
            if (slab(o, d, FRAME[b].c, FRAME[b].h, best)) { best = hitT; hit = true; nAx = hitAxis; nSg = hitSign; }
          }
        }
        const th = bayer(ix, iy);

        // front face (z = +FZ): type modules sit on it, in front of the far bars
        let behind = false;
        if (inBound && Math.abs(d[2]) > 1e-6) {
          const tf = (FZ - o[2]) / d[2];
          if (tf > 0 && tf < best) {
            const fx = o[0] + tf * d[0], fy = o[1] + tf * d[1];
            if (Math.abs(fx) < FX - T && Math.abs(fy) < FY - T) {
              const mx = Math.min(MW - 1, Math.max(0, ((fx + FX) / (2 * FX)) * MW)) | 0;
              const my = Math.min(MH - 1, Math.max(0, ((FY - fy) / (2 * FY)) * MH)) | 0;
              const k = my * MW + mx;
              const c = cov[k];
              if (c > 0.08) {
                const wi = word[k];
                // per-module build: words land left to right, scattered modules first
                const ta = clamp(((build - 0.35) / 0.65) * 1.6 - hsh * 0.6 - wi * 0.12 + 0.12);
                if (ta > 0) {
                  const vy = 1 - my / MH;
                  const sh = Math.abs(vy - sweep) < 0.05 && th > 0.25;
                  const col = sh ? C.light : wi === 1 ? C.green : C.lime;
                  const sz = cell * (c > 0.6 ? 0.9 : 0.36 + 0.5 * c) * ta * (1 - open);
                  batch.add(col, Math.round(px), Math.round(py), Math.round(sz));
                  continue;
                }
              }
              behind = hit;
              // the glass of the face: a sparse dot screen so the plane reads
              if (!hit && (ix + iy) % 2 === 0) {
                batch.add(C.dark + '|0.55', Math.round(px), Math.round(py), Math.round(cell * 0.2 * appear));
                continue;
              }
            }
          }
        }

        if (hit) {
          const nx = R[nAx] * nSg, ny = R[3 + nAx] * nSg, nz = R[6 + nAx] * nSg;
          const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          let key: string;
          if (ny > 0.5) key = th < 0.85 ? C.lime : C.green;
          else if (nz > 0.5) key = th < 0.25 + lam ? C.green : DEEP;
          else key = th < 0.6 ? DEEP : C.w500;
          if (behind) {
            // far bars seen through the face: recessive, so the type stays clean
            batch.add(C.dark, Math.round(px), Math.round(py), Math.round(cell * 0.5 * appear * (1 - open)));
            continue;
          }
          const size = cell * (0.72 + 0.2 * lam) * appear * (1 - open);
          batch.add(key, Math.round(px), Math.round(py), Math.round(size));
          if (open > 0.15) batch.add(C.dark, gx, gy, Math.round(cell * 0.3 * open));
        } else {
          // background: faint module rows, a slow wave runs through them
          let m: number;
          if (mk === 0) m = 0.25 + 0.75 * clamp((gx / w - 0.36) / 0.22);
          else m = 1 - clamp((gy / h - 0.44) / 0.12);
          if (m <= 0.02) continue;
          const wave = 0.5 + 0.5 * Math.sin(ix * 0.21 + iy * 0.11 - t * 1.1);
          const size = cell * (0.12 + 0.26 * wave * wave * wave + 0.14 * open) * m * appear;
          if (size < 1) continue;
          batch.add(wave > 0.96 && hsh > 0.8 ? C.green + '|0.6' : C.dark, Math.round(px), Math.round(py), Math.round(size));
        }
      }
    }
    batch.flush(ctx);
  }

  // adaptive rate: when a frame costs too much, paint every other step (time still advances)
  let cost = 0, odd = false;
  const loop = makeLoop(cv, (dt) => {
    t += dt;
    if (build < 1) build = Math.min(1, build + dt / 0.6);
    odd = !odd;
    if (cost > 14 && odd) return;
    const a = performance.now();
    frame();
    cost = cost * 0.9 + (performance.now() - a) * 0.1;
  });

  return {
    start() {
      // draw synchronously so the very first painted frame already has motion state
      frame();
      loop.start();
    },
    setPaused(p) { loop.pause(p); },
    renderStatic() { build = 1; t = 2.4; frame(); },
    resize() { if (!loop.on) frame(); },
  };
}
