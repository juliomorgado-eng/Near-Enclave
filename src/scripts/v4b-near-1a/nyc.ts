// Format: a New York skyline built from pixel modules inside a flat green block. Building
// logic follows v4b-nearcon-1a's createSkyField (two layers, setbacks, three landmark towers
// with spires), re-drawn as warm-black modules: the back layer is a dithered halftone, the
// front layer is solid with lime windows. Height grows with scroll; windows flicker slowly
// while the block is on screen.
import { C, Batch, bayer, cellFor, clamp, fit, hash, makeLoop, surface } from './common';

type Bldg = { x0: number; x1: number; h: number; layer: 0 | 1; steps: number; spire: number };

export type Nyc = { set(p: number): void; draw(): void; start(): void; setPaused(p: boolean): void };

export function createNyc(cv: HTMLCanvasElement, opts: { reduce: boolean }): Nyc | null {
  const s = surface(cv);
  if (!s) return null;
  const S = s;
  const batch = new Batch();
  let p = 0;
  let cols = 0, rows = 0, cell = 6, ox = 0, oy = 0;
  let bl: Bldg[] = [];
  let lit = new Uint8Array(0);
  let key = '';
  // scratch: what occupies each cell (0 sky, 1 back, 2 front wall, 3 window, 4 roof/edge, 5 spire)
  let occ = new Uint8Array(0);

  function build() {
    const k = `${S.w}x${S.h}`;
    if (k === key) return;
    key = k;
    cell = cellFor(S.w);
    cols = Math.floor(S.w / cell);
    rows = Math.floor(S.h / cell);
    ox = (S.w - (cols - 1) * cell) / 2;
    oy = (S.h - (rows - 1) * cell) / 2;
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const sc = cols / 110;
    bl = [];
    for (const layer of [0, 1] as const) {
      let x = -2;
      while (x < cols) {
        const w = Math.max(3, Math.round(((layer ? 4 : 5) + rnd() * (layer ? 7 : 9)) * sc));
        const base = layer ? 0.12 + rnd() * 0.3 : 0.28 + rnd() * 0.36;
        bl.push({ x0: Math.round(x), x1: Math.round(x + w), h: base, layer, steps: rnd() < 0.3 ? 2 : 0, spire: 0 });
        x += w + (rnd() < 0.25 ? 1 : 0);
      }
    }
    const lm = (fx: number, w: number, h: number, steps: number, spire: number) => {
      const x0 = Math.round(cols * fx - w / 2);
      bl.push({ x0, x1: x0 + w, h, layer: 0, steps, spire });
    };
    lm(0.6, Math.round(11 * sc), 0.7, 3, 0.12);
    lm(0.84, Math.round(9 * sc), 0.76, 4, 0.1);
    lm(0.33, Math.round(8 * sc), 0.58, 2, 0.05);
    lit = new Uint8Array(cols * rows);
    for (let i = 0; i < lit.length; i++) lit[i] = rnd() < 0.42 ? 1 : 0;
    occ = new Uint8Array(cols * rows);
  }

  const easeO = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

  function draw() {
    if (!fit(S)) return;
    build();
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    occ.fill(0);
    const top = rows - 2; // street row index
    for (const layer of [0, 1] as const) {
      for (const b of bl) {
        if (b.layer !== layer) continue;
        const delay = (b.x0 / cols) * 0.35;
        const hh = Math.round(b.h * rows * easeO((p - delay) / 0.6));
        if (hh <= 0) continue;
        const bw = b.x1 - b.x0;
        for (let c = Math.max(0, b.x0); c < Math.min(cols, b.x1); c++) {
          const lc = c - b.x0;
          let tp = hh;
          if (b.steps) {
            const edge = Math.min(lc, bw - 1 - lc);
            const stepW = Math.max(1, Math.floor(bw / (2 * b.steps + 1)));
            tp = Math.round(hh * (1 - 0.12 * (b.steps - Math.min(b.steps, Math.floor(edge / stepW)))));
          }
          for (let rb = 0; rb < tp && rb <= top; rb++) {
            const r = top - rb;
            const k = r * cols + c;
            if (layer === 0) occ[k] = rb === tp - 1 ? 4 : 1;
            else {
              const win = lc > 0 && lc < bw - 1 && lc % 2 === 1 && rb % 2 === 1 && rb < tp - 2;
              occ[k] = rb === tp - 1 || lc === 0 || lc === bw - 1 ? 4 : win ? (lit[k] ? 3 : 0) : 2;
              // an unlit window still belongs to the front wall: show the green behind it
              if (win && !lit[k]) occ[k] = 6;
            }
          }
          if (b.spire && lc === Math.floor(bw / 2)) {
            const sp = Math.round(b.spire * rows * easeO((p - delay - 0.2) / 0.5));
            for (let q = 0; q < sp; q++) {
              const rb = tp + q;
              if (rb > top) break;
              occ[(top - rb) * cols + c] = 5;
            }
          }
        }
      }
    }
    const sky = clamp(p * 1.4);
    for (let r = 0; r < rows; r++) {
      const y = Math.round(oy + r * cell);
      for (let c = 0; c < cols; c++) {
        const x = Math.round(ox + c * cell);
        const o = occ[r * cols + c];
        const th = bayer(c, r);
        if (r === top + 1) {
          // street: a dotted row
          if (c % 2 === 0) batch.add(C.ink, x, y, Math.round(cell * 0.5 * sky));
          continue;
        }
        switch (o) {
          case 0: {
            // sky: a halftone that thins towards the street
            const f = 1 - r / rows;
            if (th < f * 0.55 - 0.18) batch.add(C.ink + '|0.22', x, y, Math.round(cell * 0.24 * sky));
            break;
          }
          case 1:
            batch.add(th < 0.55 ? C.ink + '|0.5' : C.ink + '|0.3', x, y, Math.round(cell * (th < 0.55 ? 0.62 : 0.4)));
            break;
          case 2:
            batch.add(C.ink, x, y, Math.round(cell * 0.92));
            break;
          case 3:
            batch.add(C.lime, x, y, Math.round(cell * 0.7));
            break;
          case 4:
            batch.add(C.ink, x, y, cell);
            break;
          case 5:
            batch.add(r % 3 === 0 ? C.lime : C.ink, x, y, Math.round(cell * 0.62));
            break;
          case 6:
            batch.add(C.ink + '|0.2', x, y, Math.round(cell * 0.3));
            break;
        }
      }
    }
    batch.flush(ctx);
  }

  const loop = makeLoop(cv, () => {
    if (p < 0.6 || !lit.length) return;
    for (let i = 0; i < 10; i++) {
      const k = (hash(i, performance.now() | 0) * lit.length) | 0;
      lit[k] ^= 1;
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
