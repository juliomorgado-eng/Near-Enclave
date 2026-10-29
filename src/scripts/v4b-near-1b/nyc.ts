// Format (flat): a New York skyline as solid vector silhouettes over the flat green block.
// Same building logic as 1A (two layers, setbacks, three landmark towers with spires), now
// drawn as polygons in three flat tones: back layer mid green, landmarks deep green, front
// layer warm black with a hairline window grid and a few lit (lime) windows. Buildings rise
// with scroll; lit windows switch slowly while the block is on screen.
import { C, clamp, fit, hash, makeLoop, surface } from './common';

type Bldg = { x0: number; x1: number; h: number; layer: 0 | 1; steps: number; spire: number; lm: boolean; lit: Uint8Array };

const BACK = '#0D8458';
const LAND = '#0F5E41';

export type Nyc = { set(p: number): void; draw(): void; start(): void; setPaused(p: boolean): void };

export function createNyc(cv: HTMLCanvasElement, opts: { reduce: boolean }): Nyc | null {
  const s = surface(cv);
  if (!s) return null;
  const S = s;
  let p = 0;
  let bl: Bldg[] = [];
  let key = '';
  // building widths are in grid units of 1/110 of the block width (as 1A's columns)
  const COLS = 110;
  const WIN = 2; // window pitch in units
  const lits: Uint8Array[] = [];

  function build() {
    const k = `${S.w}x${S.h}`;
    if (k === key) return;
    key = k;
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const mkLit = () => {
      const a = new Uint8Array(400);
      for (let i = 0; i < a.length; i++) a[i] = rnd() < 0.18 ? 1 : 0;
      return a;
    };
    bl = [];
    lits.length = 0;
    for (const layer of [0, 1] as const) {
      let x = -2;
      while (x < COLS) {
        const w = Math.max(3, Math.round((layer ? 4 : 5) + rnd() * (layer ? 7 : 9)));
        const base = layer ? 0.12 + rnd() * 0.3 : 0.28 + rnd() * 0.36;
        const b: Bldg = { x0: Math.round(x), x1: Math.round(x + w), h: base, layer, steps: rnd() < 0.3 ? 2 : 0, spire: 0, lm: false, lit: mkLit() };
        bl.push(b);
        if (layer) lits.push(b.lit);
        x += w + (rnd() < 0.25 ? 1 : 0);
      }
    }
    const lm = (fx: number, w: number, h: number, steps: number, spire: number) => {
      const x0 = Math.round(COLS * fx - w / 2);
      bl.splice(bl.findIndex((b) => b.layer === 1), 0, { x0, x1: x0 + w, h, layer: 0, steps, spire, lm: true, lit: mkLit() });
    };
    lm(0.6, 11, 0.7, 3, 0.12);
    lm(0.84, 9, 0.76, 4, 0.1);
    lm(0.33, 8, 0.58, 2, 0.05);
  }

  const easeO = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

  function draw() {
    if (!fit(S)) return;
    build();
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    const u = w / COLS;
    const street = Math.round(h - u * 1.5);
    const X = (c: number) => Math.round(c * u);

    for (const b of bl) {
      const delay = (b.x0 / COLS) * 0.35;
      const hh = b.h * street * easeO((p - delay) / 0.6);
      if (hh < 1) continue;
      const bw = b.x1 - b.x0;
      const xa = X(b.x0), xb = X(b.x1);
      const yTop = Math.round(street - hh);
      ctx.fillStyle = b.layer ? C.ink : b.lm ? LAND : BACK;
      // stepped silhouette: each setback tier is a narrower rect on top of the last
      const tiers = b.steps;
      const stepW = Math.max(1, Math.floor(bw / (2 * tiers + 1)));
      ctx.beginPath();
      if (!tiers) ctx.rect(xa, yTop, xb - xa, street - yTop);
      else {
        for (let t = 0; t <= tiers; t++) {
          const ty = Math.round(street - hh * (1 - 0.12 * (tiers - t)));
          const ia = X(b.x0 + t * stepW), ib = X(b.x1 - t * stepW);
          if (ib > ia) ctx.rect(ia, ty, ib - ia, street - ty);
        }
      }
      ctx.fill();
      if (b.spire) {
        const sp = b.spire * street * easeO((p - delay - 0.2) / 0.5);
        if (sp > 1) {
          const mx = X(b.x0 + bw / 2);
          ctx.fillStyle = b.lm ? LAND : C.ink;
          ctx.fillRect(mx - 1, Math.round(yTop - sp), 2, Math.round(sp) + 1);
          ctx.fillStyle = C.lime;
          ctx.fillRect(mx - 1, Math.round(yTop - sp), 2, 2);
        }
      }
      // landmarks: vertical hairline mullions
      if (b.lm) {
        ctx.strokeStyle = 'rgba(0,220,141,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = b.x0 + 2; c < b.x1 - 1; c += 2) {
          const xx = X(c) + 0.5;
          ctx.moveTo(xx, yTop + u * 2);
          ctx.lineTo(xx, street);
        }
        ctx.stroke();
      }
      // front layer: hairline window grid in green, a few lime windows
      if (b.layer === 1 && bw > 2) {
        const top = yTop + u * 1.5;
        const nr = Math.floor((street - top) / (u * WIN));
        const nc = Math.floor((bw - 1) / WIN);
        if (nr > 0 && nc > 0) {
          const gx0 = xa + Math.round(((bw - nc * WIN) / 2) * u);
          ctx.strokeStyle = 'rgba(0,220,141,0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let c = 0; c <= nc; c++) {
            const xx = gx0 + Math.round(c * WIN * u) + 0.5;
            ctx.moveTo(xx, top);
            ctx.lineTo(xx, street);
          }
          for (let r = 0; r <= nr; r++) {
            const yy = Math.round(street - r * WIN * u) + 0.5;
            ctx.moveTo(gx0, yy);
            ctx.lineTo(gx0 + Math.round(nc * WIN * u), yy);
          }
          ctx.stroke();
          ctx.fillStyle = C.lime;
          const pad = Math.max(1, Math.round(u * 0.45));
          for (let r = 0; r < nr; r++)
            for (let c = 0; c < nc; c++) {
              if (!b.lit[(r * nc + c) % b.lit.length]) continue;
              const xx = gx0 + Math.round(c * WIN * u) + pad;
              const yy = Math.round(street - (r + 1) * WIN * u) + pad;
              const sz = Math.round(WIN * u) - pad * 2 + 1;
              if (sz > 0) ctx.fillRect(xx, yy, sz, sz);
            }
        }
      }
    }
    // street: one hairline across the block
    const sky = clamp(p * 1.4);
    if (sky > 0) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, street, Math.round(w * sky), Math.max(1, Math.round(u * 0.3)));
    }
  }

  const loop = makeLoop(cv, () => {
    if (p < 0.6 || !lits.length) return;
    for (let i = 0; i < 4; i++) {
      const a = lits[(hash(i, performance.now() | 0) * lits.length) | 0];
      const k = (hash(i + 17, performance.now() | 0) * a.length) | 0;
      a[k] ^= 1;
    }
    draw();
  }, 6);

  return {
    set(v: number) {
      if (Math.abs(v - p) < 0.0005) return;
      p = v;
      draw();
    },
    draw,
    start() { if (!opts.reduce) loop.start(); },
    setPaused(v: boolean) { loop.pause(v); },
  };
}
