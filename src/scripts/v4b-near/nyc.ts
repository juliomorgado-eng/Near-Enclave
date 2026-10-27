// Format: Manhattan as a pixel map inside a flat green block. The island is rasterised
// from a coarse outline onto the module grid; water reads as a halftone falloff.
import { C, Batch, bayer, clamp, easeOut, fit, hash, surface } from './common';

// coarse outline, [lat, lon], west side south -> north, then east side north -> south
const ISLAND: [number, number][] = [
  [40.7009, -74.0153], [40.704, -74.0189], [40.711, -74.0172], [40.719, -74.0135], [40.728, -74.011],
  [40.742, -74.01], [40.754, -74.008], [40.77, -73.995], [40.782, -73.988], [40.8, -73.974],
  [40.818, -73.962], [40.832, -73.952], [40.85, -73.947], [40.86, -73.939], [40.87, -73.93],
  [40.879, -73.925], [40.878, -73.915], [40.872, -73.909], [40.862, -73.915], [40.845, -73.929],
  [40.833, -73.934], [40.818, -73.933], [40.807, -73.93], [40.798, -73.929], [40.79, -73.938],
  [40.78, -73.942], [40.77, -73.95], [40.759, -73.958], [40.748, -73.968], [40.738, -73.972],
  [40.727, -73.972], [40.716, -73.976], [40.711, -73.979], [40.708, -73.998], [40.703, -74.008],
];
const PARK: [number, number][] = [[40.7681, -73.9819], [40.7644, -73.973], [40.7968, -73.9493], [40.8005, -73.958]];

const K = Math.cos((40.79 * Math.PI) / 180);
// rotate so the island's spine stands upright
const AX = (-73.925 + 74.015) * K;
const AY = 40.879 - 40.701;
const AL = Math.hypot(AX, AY);
const SA = (AX / AL) * 0.35; // keep most of the true NNE tilt
const CA = Math.sqrt(1 - SA * SA);
const proj = ([lat, lon]: [number, number]): [number, number] => {
  const x = (lon + 74.0) * K;
  const y = lat - 40.79;
  return [x * CA - y * SA, x * SA + y * CA]; // y up
};
const ISL = ISLAND.map(proj);
const PRK = PARK.map(proj);
const bx = ISL.map((p) => p[0]);
const by = ISL.map((p) => p[1]);
const MINX = Math.min(...bx), MAXX = Math.max(...bx), MINY = Math.min(...by), MAXY = Math.max(...by);

function inside(poly: [number, number][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

type Cell = { ix: number; iy: number; kind: 0 | 1 | 2; dist: number; ny: number }; // 0 water, 1 land, 2 park

export type Nyc = { set(p: number): void; draw(): void };

export function createNyc(cv: HTMLCanvasElement): Nyc | null {
  const s = surface(cv);
  if (!s) return null;
  const S = s;
  const batch = new Batch();
  let p = 0;
  let cells: Cell[] = [];
  let key = '';
  let cell = 10, ox = 0, oy = 0;

  function raster() {
    const { w, h } = S;
    const k = `${w}x${h}`;
    if (k === key) return;
    key = k;
    const rows = w < 420 ? 50 : 66;
    cell = Math.max(6, Math.floor(h / rows));
    const cols = Math.floor(w / cell);
    const nr = Math.floor(h / cell);
    ox = (w - (cols - 1) * cell) / 2;
    oy = (h - (nr - 1) * cell) / 2;
    // fit map height into 88 % of the block
    const mh = MAXY - MINY;
    const mw = MAXX - MINX;
    const sc = Math.min((h * 0.88) / mh, (w * 0.86) / mw);
    const cx = w / 2, cy = h / 2;
    const mx = (MINX + MAXX) / 2, my = (MINY + MAXY) / 2;
    const grid: Cell[][] = [];
    cells = [];
    for (let iy = 0; iy < nr; iy++) {
      grid[iy] = [];
      for (let ix = 0; ix < cols; ix++) {
        const px = ox + ix * cell, py = oy + iy * cell;
        const x = (px - cx) / sc + mx;
        const y = -(py - cy) / sc + my;
        let kind: 0 | 1 | 2 = 0;
        if (inside(ISL, x, y)) kind = inside(PRK, x, y) ? 2 : 1;
        const c: Cell = { ix, iy, kind, dist: kind ? 0 : 99, ny: clamp((y - MINY) / mh) };
        grid[iy][ix] = c;
        cells.push(c);
      }
    }
    // chebyshev distance to land for the water halftone (6 rings)
    for (let ring = 1; ring <= 6; ring++) {
      for (const c of cells) {
        if (c.dist !== 99) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = grid[c.iy + dy]?.[c.ix + dx];
            if (n && n.dist === ring - 1) { near = true; break; }
          }
        if (near) c.dist = ring;
      }
    }
  }

  function draw() {
    if (!fit(S)) return;
    raster();
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    for (const c of cells) {
      const x = Math.round(ox + c.ix * cell);
      let y = oy + c.iy * cell;
      const th = bayer(c.ix, c.iy);
      if (c.kind === 0) {
        // water: rings of shrinking modules around the shore, faint rows beyond
        const lp = clamp((p * 1.4 - 0.15 - c.dist * 0.06) * 2.5);
        if (lp <= 0) continue;
        const sz = c.dist <= 6 ? cell * Math.max(0.14, 0.5 - c.dist * 0.07) : cell * 0.12;
        batch.add(c.dist <= 2 && th > 0.5 ? C.ink + '|0.55' : C.ink + '|0.32', x, Math.round(y), Math.round(sz * lp));
      } else {
        // land assembles from the Battery northward
        const lp = easeOut(clamp((p - c.ny * 0.5 - hash(c.ix, c.iy) * 0.14) / 0.3));
        if (lp <= 0) continue;
        y -= (1 - lp) * cell * 5;
        if (c.kind === 2) batch.add(C.ink + '|0.45', x, Math.round(y), Math.round(cell * 0.36 * lp));
        else batch.add(th < 0.78 ? C.ink : C.ink + '|0.6', x, Math.round(y), Math.round(cell * (th < 0.78 ? 0.86 : 0.6) * lp));
      }
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
