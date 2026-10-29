// Build-time pixel helpers for v4B-NEAR-1A components: everything decorative is made of
// square modules, emitted as one SVG path per tone so the DOM stays light.
export type Mod = { x: number; y: number; s: number };

const f = (n: number) => +n.toFixed(3);

/** one path for many squares; s is the module fill 0..1, centred in its cell */
export function path(mods: Mod[]): string {
  let d = '';
  for (const m of mods) {
    if (m.s <= 0) continue;
    const o = (1 - m.s) / 2;
    d += `M${f(m.x + o)} ${f(m.y + o)}h${f(m.s)}v${f(m.s)}h${f(-m.s)}z`;
  }
  return d;
}

/** '#' cells of a bitmap become full modules */
export function bitmap(rows: string[], ch = '#', s = 0.86): Mod[] {
  const out: Mod[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => c === ch && out.push({ x, y, s })));
  return out;
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => B4[(y & 3) * 4 + (x & 3)] / 16;

export function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * Head-and-shoulders silhouette in dithered modules with a sealed band across the eyes.
 * Returns two layers: body (halftone) and seal (solid).
 */
export function portrait(v: number, C = 30, R = 38) {
  const rnd = rng(97 + v * 131);
  const cx = 0.5 + (rnd() - 0.5) * 0.06;
  const hrx = 0.2 + rnd() * 0.03, hry = 0.21 + rnd() * 0.02;
  const shw = 0.27 + rnd() * 0.05;
  const body: Mod[] = [];
  const seal: Mod[] = [];
  for (let y = 0; y < R; y++)
    for (let x = 0; x < C; x++) {
      const X = (x + 0.5) / C, Y = (y + 0.5) / R;
      const head = Math.hypot((X - cx) / hrx, (Y - 0.36) / hry) - 1;
      const neck = Math.abs(X - cx) < 0.08 && Y > 0.5 && Y < 0.7;
      const half = Math.min(0.5, shw + (Y - 0.68) * 1.2);
      const bod = Y > 0.68 && Math.abs(X - cx) < half;
      if (!(head < 0 || neck || bod)) continue;
      if (head < 0 && Y > 0.31 && Y < 0.4) {
        seal.push({ x, y, s: 0.9 });
        continue;
      }
      // light from the upper left
      const l = Math.min(1, Math.max(0, 0.75 + (cx - X) * 1.6 - (Y - 0.3) * 0.5));
      const th = bayer(x, y);
      body.push({ x, y, s: th < l ? 0.82 : 0.38 });
    }
  return { body: path(body), seal: path(seal), C, R };
}
