// Build-time flat-shape helpers for v4B-NEAR-1B components: solid vector geometry only
// (no square modules, no dither).
export function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const f = (n: number) => +n.toFixed(2);

/**
 * Head-and-shoulders silhouette as flat vector shapes, with a solid seal band across the eyes.
 * Returns the head ellipse, the shoulders path and the seal band (to be clipped to the head).
 */
export function portrait(v: number, C = 30, R = 38) {
  const rnd = rng(97 + v * 131);
  const cx = (0.5 + (rnd() - 0.5) * 0.06) * C;
  const hrx = (0.2 + rnd() * 0.03) * C, hry = (0.21 + rnd() * 0.02) * R;
  const shw = (0.27 + rnd() * 0.05) * C;
  const hy = 0.36 * R;
  const neckW = 0.08 * C;
  const sy = 0.68 * R;
  // shoulders: flat top that widens to the frame edge, square corners
  const wide = Math.min(C / 2, shw + 0.32 * R * 1.2 * (C / R));
  const body =
    `M${f(cx - neckW)} ${f(0.5 * R)}H${f(cx + neckW)}V${f(sy)}H${f(cx + shw)}` +
    `L${f(cx + wide)} ${R}H${f(cx - wide)}L${f(cx - shw)} ${f(sy)}H${f(cx - neckW)}Z`;
  return { cx: f(cx), cy: f(hy), rx: f(hrx), ry: f(hry), body, sealY: f(0.31 * R), sealH: f(0.09 * R), C, R };
}
