// Shift: scattered modules joined by thin links (an open network) snap onto a strict
// grid and pack into a sealed pixel lock. Progress is scroll-scrubbed; draws on demand.
import { C, Batch, bayer, clamp, ease, fit, hash, lerp, mulberry, surface } from './common';

// Padlock on an 18-module grid. The shackle is a 2-module pixel arch whose legs run
// into the body (drawn behind it); the body carries a classic keyhole: round head,
// narrow slot, flared foot.
const SHACKLE = [
  '......SSSSSS......',
  '....SSSSSSSSSS....',
  '...SSS......SSS...',
  '...SS........SS...',
  '...SS........SS...',
  '...SS........SS...',
  '...SS........SS...',
  '...SS........SS...',
  '...SS........SS...',
  '...SS........SS...',
  '...SS........SS...',
];
const BODY_TOP = 9;
const BODY = [
  'BBBBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBBBB',
  'BBBBBBB....BBBBBBB',
  'BBBBBB......BBBBBB',
  'BBBBBB......BBBBBB',
  'BBBBBBB....BBBBBBB',
  'BBBBBBBB..BBBBBBBB',
  'BBBBBBBB..BBBBBBBB',
  'BBBBBBB....BBBBBBB',
  'BBBBBBB....BBBBBBB',
  'BBBBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBBBB',
];
const AW = 18;
const AH = BODY_TOP + BODY.length;

type Mod = { gx: number; gy: number; sh: boolean; sx: number; sy: number; delay: number; n: number[] };
type Dust = { sx: number; sy: number; out: number };

export type Shift = { set(p: number): void; draw(): void };

export function createShift(cv: HTMLCanvasElement): Shift | null {
  const s = surface(cv);
  if (!s) return null;
  const S = s;
  const rnd = mulberry(20270401);
  const batch = new Batch();
  const mods: Mod[] = [];
  const push = (gx: number, gy: number, sh: boolean) =>
    mods.push({
      gx, gy, sh,
      sx: 0.04 + rnd() * 0.92,
      sy: 0.04 + rnd() * 0.92,
      // body packs from the bottom up, the shackle lands last
      delay: (sh ? 0.3 : ((AH - gy) / AH) * 0.24) + hash(gx, gy) * 0.1,
      n: [],
    });
  SHACKLE.forEach((row, gy) => [...row].forEach((ch, gx) => ch === 'S' && push(gx, gy, true)));
  BODY.forEach((row, r) => [...row].forEach((ch, gx) => ch === 'B' && push(gx, BODY_TOP + r, false)));
  // links: each module to its two nearest neighbours in the scattered state
  mods.forEach((m, i) => {
    const ds = mods
      .map((o, j) => ({ j, d: j === i ? Infinity : (o.sx - m.sx) ** 2 + (o.sy - m.sy) ** 2 }))
      .sort((a, b) => a.d - b.d);
    m.n = [ds[0].j, ds[1].j].filter((j) => j > i);
  });
  const dust: Dust[] = Array.from({ length: 150 }, () => ({ sx: rnd(), sy: rnd(), out: 0.2 + rnd() * 0.45 }));

  let p = 0;
  const pos = new Float32Array(mods.length * 2);

  function draw() {
    if (!fit(S)) return;
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    const cell = Math.max(6, Math.floor(Math.min(w / (AW + 4), h / (AH + 6))));
    const x0 = Math.round((w - AW * cell) / 2 + cell / 2);
    const y0 = Math.round((h - AH * cell) / 2 + cell * 1.5);
    const seal = clamp((p - 0.66) / 0.14); // sealed by 80 %, then held
    const drop = (1 - ease(seal)) * 3; // shackle rides 3 modules high until it locks

    // background grid of faint modules: the strict grid everything snaps to
    const gcols = Math.ceil(w / cell) + 1;
    const grows = Math.ceil(h / cell) + 1;
    const gox = x0 - Math.ceil(x0 / cell) * cell;
    const goy = y0 - Math.ceil(y0 / cell) * cell;
    const gA = clamp(p * 1.6);
    if (gA > 0.02) {
      for (let iy = 0; iy < grows; iy++)
        for (let ix = 0; ix < gcols; ix++) batch.add(C.dark, gox + ix * cell, goy + iy * cell, Math.round(cell * 0.16 * gA) || 0);
    }

    // dust: modules that stay in the open, then dissolve
    for (const d of dust) {
      const k = 1 - clamp(p / d.out);
      if (k <= 0) continue;
      batch.add(C.w500 + '|0.7', Math.round(d.sx * w), Math.round(d.sy * h), Math.round(cell * 0.28 * k));
    }

    // module positions
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      const lp = ease(clamp((p - m.delay) / 0.3));
      const tx = x0 + m.gx * cell;
      const ty = y0 + (m.gy - (m.sh ? drop : 0)) * cell;
      pos[i * 2] = lerp(m.sx * w, tx, lp);
      pos[i * 2 + 1] = lerp(m.sy * h, ty, lp);
    }

    // links of the open network, fading as modules lock in
    const linkA = 1 - clamp(p / 0.7);
    if (linkA > 0.01) {
      ctx.strokeStyle = C.w500;
      ctx.globalAlpha = 0.45 * linkA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < mods.length; i++) {
        for (const j of mods[i].n) {
          ctx.moveTo(Math.round(pos[i * 2]) + 0.5, Math.round(pos[i * 2 + 1]) + 0.5);
          ctx.lineTo(Math.round(pos[j * 2]) + 0.5, Math.round(pos[j * 2 + 1]) + 0.5);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // shackle first (it slides behind the body), then the body
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
          size = cell * 0.3;
        } else if (m.sh) {
          key = seal > 0.5 ? C.lime : C.w300;
          size = cell * lerp(0.62, 0.9, lp);
        } else {
          const dense = 0.5 + 0.5 * seal;
          key = th < dense ? C.green : C.green + '|0.4';
          size = cell * lerp(0.5, seal > 0.98 ? 1 : 0.88, lp);
        }
        batch.add(key, Math.round(pos[i * 2]), Math.round(pos[i * 2 + 1]), Math.round(size));
      }
      batch.flush(ctx);
    }
    batch.flush(ctx);
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
