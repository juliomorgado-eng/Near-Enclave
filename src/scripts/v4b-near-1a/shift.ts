// Shift: scattered modules joined by dotted links (an open network) snap onto a strict grid
// and pack into a sealed pixel lock. The lock is rasterised procedurally at 72 modules wide,
// so the squares are ~2x finer than v4b-near. Scroll-scrubbed; draws on demand.
import { C, Batch, bayer, clamp, ease, fit, hash, lerp, mulberry, surface } from './common';

const AW = 72;
const R_OUT = AW * 0.36;
const R_IN = AW * 0.245;
const ARCH_CY = R_OUT; // arch centre row
const BODY_TOP = Math.round(AW * 0.6);
const BODY_H = Math.round(AW * 0.72);
const AH = BODY_TOP + BODY_H;
const CX = AW / 2;
const KEY_CY = BODY_TOP + BODY_H * 0.36;
const KEY_R = AW * 0.085;

function inLock(gx: number, gy: number): 0 | 1 | 2 {
  const x = gx + 0.5, y = gy + 0.5;
  if (gy >= BODY_TOP) {
    // keyhole: round head, slot, flared foot
    const dk = Math.hypot(x - CX, y - KEY_CY);
    if (dk < KEY_R) return 0;
    const below = y - KEY_CY;
    const slot = below > 0 && below < BODY_H * 0.34 && Math.abs(x - CX) < AW * (0.03 + (below > BODY_H * 0.26 ? 0.03 : 0));
    if (slot) return 0;
    return 2;
  }
  if (y <= ARCH_CY) {
    const dr = Math.hypot(x - CX, y - ARCH_CY);
    return dr <= R_OUT && dr >= R_IN ? 1 : 0;
  }
  const ax = Math.abs(x - CX);
  return ax >= R_IN && ax <= R_OUT ? 1 : 0;
}

type Mod = { gx: number; gy: number; sh: boolean; sx: number; sy: number; delay: number };
type Dust = { sx: number; sy: number; out: number };

export type Shift = { set(p: number): void; draw(): void };

export function createShift(cv: HTMLCanvasElement): Shift | null {
  const s = surface(cv);
  if (!s) return null;
  const S = s;
  const rnd = mulberry(20270401);
  const batch = new Batch();
  const mods: Mod[] = [];
  for (let gy = 0; gy < AH; gy++)
    for (let gx = 0; gx < AW; gx++) {
      const k = inLock(gx, gy);
      if (!k) continue;
      const sh = k === 1;
      mods.push({
        gx, gy, sh,
        sx: 0.04 + rnd() * 0.92,
        sy: 0.04 + rnd() * 0.92,
        delay: (sh ? 0.3 : ((AH - gy) / AH) * 0.24) + hash(gx, gy) * 0.1,
      });
    }
  // network hubs: every 9th module carries links to its two nearest hubs (scattered state)
  const hubs = mods.map((_, i) => i).filter((i) => i % 9 === 0);
  const links: [number, number][] = [];
  for (const i of hubs) {
    let a = -1, b = -1, da = Infinity, db = Infinity;
    for (const j of hubs) {
      if (j === i) continue;
      const dd = (mods[j].sx - mods[i].sx) ** 2 + (mods[j].sy - mods[i].sy) ** 2;
      if (dd < da) { b = a; db = da; a = j; da = dd; }
      else if (dd < db) { b = j; db = dd; }
    }
    if (a > i) links.push([i, a]);
    if (b > i) links.push([i, b]);
  }
  const dust: Dust[] = Array.from({ length: 260 }, () => ({ sx: rnd(), sy: rnd(), out: 0.2 + rnd() * 0.45 }));

  let p = 0;
  const pos = new Float32Array(mods.length * 2);

  function draw() {
    if (!fit(S)) return;
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    const cell = Math.max(3, Math.min(8, Math.floor(Math.min(w / (AW + 6), h / (AH + 8)))));
    const x0 = Math.round((w - AW * cell) / 2 + cell / 2);
    const y0 = Math.round((h - AH * cell) / 2 + cell * 3);
    const seal = clamp((p - 0.66) / 0.14);
    const drop = (1 - ease(seal)) * 6;

    // background grid of faint modules: the strict grid everything snaps to
    const gcols = Math.ceil(w / cell) + 1;
    const grows = Math.ceil(h / cell) + 1;
    const gox = x0 - Math.ceil(x0 / cell) * cell;
    const goy = y0 - Math.ceil(y0 / cell) * cell;
    const gA = clamp(p * 1.6);
    if (gA > 0.02) {
      const gs = Math.round(cell * 0.24 * gA);
      for (let iy = 0; iy < grows; iy += 2)
        for (let ix = 0; ix < gcols; ix += 2) batch.add(C.dark, gox + ix * cell, goy + iy * cell, gs);
    }

    for (const d of dust) {
      const k = 1 - clamp(p / d.out);
      if (k <= 0) continue;
      batch.add(C.w500 + '|0.7', Math.round(d.sx * w), Math.round(d.sy * h), Math.round(cell * 0.5 * k));
    }

    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      const lp = ease(clamp((p - m.delay) / 0.3));
      const tx = x0 + m.gx * cell;
      const ty = y0 + (m.gy - (m.sh ? drop : 0)) * cell;
      pos[i * 2] = lerp(m.sx * w, tx, lp);
      pos[i * 2 + 1] = lerp(m.sy * h, ty, lp);
    }

    // links as dotted pixel lines, fading as modules lock in
    const linkA = 1 - clamp(p / 0.7);
    if (linkA > 0.01) {
      const step = Math.max(4, cell * 1.1);
      const ds = Math.max(1, Math.round(cell * 0.34));
      const key = C.w500 + '|' + (0.75 * linkA).toFixed(2);
      for (const [i, j] of links) {
        const ax = pos[i * 2], ay = pos[i * 2 + 1], bx = pos[j * 2], by = pos[j * 2 + 1];
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.floor(len / step);
        for (let k = 1; k < n; k++) {
          const f = k / n;
          batch.add(key, Math.round(lerp(ax, bx, f)), Math.round(lerp(ay, by, f)), ds);
        }
      }
      batch.flush(ctx);
    }

    for (const pass of [true, false]) {
      for (let i = 0; i < mods.length; i++) {
        const m = mods[i];
        if (m.sh !== pass) continue;
        const lp = ease(clamp((p - m.delay) / 0.3));
        const th = bayer(m.gx, m.gy);
        let key: string;
        let size: number;
        if (lp < 0.6) {
          key = C.w400;
          size = cell * 0.5;
        } else if (m.sh) {
          key = seal > 0.5 ? C.lime : C.w300;
          size = cell * lerp(0.62, 0.9, lp);
        } else {
          const dense = 0.5 + 0.5 * seal;
          key = th < dense ? C.green : C.green + '|0.4';
          size = cell * lerp(0.5, seal > 0.98 ? 1 : 0.86, lp);
        }
        batch.add(key, Math.round(pos[i * 2]), Math.round(pos[i * 2 + 1]), Math.max(1, Math.round(size)));
      }
      batch.flush(ctx);
    }
  }

  return {
    set(v: number) {
      if (Math.abs(v - p) < 0.0005) return;
      p = v;
      draw();
    },
    draw,
  };
}
