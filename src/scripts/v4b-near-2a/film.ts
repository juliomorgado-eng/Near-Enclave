// v4B-NEAR-2A — stipple core, adapted from the NEAR Launch Film (canvas 2D):
// rng / hash, easing (outExpo, inOut), a yaw/pitch camera with a mild perspective, depth
// shading (far = pale + small, near = ink + larger) and the film's grain distribution.
// Points are bucketed by palette index + quantised alpha so one frame is a few dozen fills.

export type RGB = readonly [number, number, number];
export const C = {
  paper: [247, 246, 242],
  ink: [21, 20, 18],
  warm: [140, 133, 126],
  pale: [205, 199, 191],
  green: [0, 236, 151],
  deep: [46, 110, 87],
  night: [30, 27, 24],
  bone: [237, 233, 227],
  ash: [78, 72, 66],
  mint: [69, 232, 194],
} as const satisfies Record<string, RGB>;

/* ---------- math (film) ---------- */
export const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sm = (a: number, b: number, v: number) => {
  const x = cl((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
export const eOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const eInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ---------- palette: indices into one table so draws can be bucketed ---------- */
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const K = {
  L: 0, // 0..15 light ramp: pale → ink
  D: 16, // 16..31 dark ramp: ash → bone
  GREEN: 32,
  DEEP: 33,
  MINT: 34,
  WARM: 35,
  PALE: 36,
  INK: 37,
  BONE: 38,
  GPAPER: 39,
  ASH: 40,
} as const;
export const PALETTE: string[] = [];
for (let i = 0; i < 16; i++) PALETTE.push(css(mixc(C.pale, C.ink, i / 15)));
for (let i = 0; i < 16; i++) PALETTE.push(css(mixc(C.ash, C.bone, i / 15)));
PALETTE.push(css(C.green), css(C.deep), css(C.mint), css(C.warm), css(C.pale), css(C.ink), css(C.bone), css(mixc(C.green, C.paper, 0.35)), css(C.ash));

/* ---------- points ---------- */
export type Pt = { r1: number; r2: number; r3: number; r4: number; r5: number; r6: number; r7: number };
export type O = { x: number; y: number; d: number; nx: number; f: number; c: number; a: number; s: number; h: number };
export const newO = (): O => ({ x: 0, y: 0, d: 0.5, nx: 0, f: 1, c: 0, a: 0, s: 0, h: 0 });

/** film: a fine stipple, a few larger grains */
export function grain(p: Pt) {
  const g = p.r5;
  return g < 0.62 ? 1.5 + g * 1.3 : g < 0.94 ? 2.6 + (g - 0.62) * 4.2 : 4.0 + (g - 0.94) * 30;
}

/* ---------- camera (film) ---------- */
export class Cam {
  cx = 0; cy = 0; s = 1; cyw = 1; syw = 0; cp = 1; sp = 0;
  set(cx: number, cy: number, s: number, yaw: number, pitch: number) {
    this.cx = cx; this.cy = cy; this.s = s;
    this.cyw = Math.cos(yaw); this.syw = Math.sin(yaw);
    this.cp = Math.cos(pitch); this.sp = Math.sin(pitch);
  }
  proj(x: number, y: number, z: number, o: O) {
    const x1 = x * this.cyw + z * this.syw, z1 = -x * this.syw + z * this.cyw;
    const y1 = y * this.cp - z1 * this.sp, z2 = y * this.sp + z1 * this.cp;
    const f = 1 / (1 - z2 * 0.13);
    o.x = this.cx + x1 * this.s * f;
    o.y = this.cy - y1 * this.s * f;
    o.d = cl((z2 + 1.25) / 2.5);
    o.nx = x1;
    o.f = f;
  }
}
/** grain scale for a camera scale (the film runs at s≈300 on a 1080p frame shown ~0.67×) */
export const grainK = (s: number) => cl((s / 300) * 0.78, 0.42, 1.05);

/* ---------- scene contract ---------- */
export type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
export type LogoPts = { u: Float32Array; v: Float32Array; mark: Uint8Array; n: number; step: number };
export type Params = { shift: number; stat: number; aud: number; logo: LogoPts | null };
export type Env = {
  t: number; // seconds since boot
  age: number; // seconds since this scene became active
  rects: Rect[];
  vw: number; vh: number;
  N: number; M: number;
  dark: (y: number) => boolean;
  P: Params;
  reduce: boolean;
};
export type Scene = {
  /** ring of accent squares around the (single) slot, as in the film */
  dust?: boolean;
  /** form radius in slot-min units, for dust + guides */
  extent?: number;
  prepare(e: Env): void;
  pose(rk: number, p: Pt, e: Env, o: O): void;
  overlay?(g: CanvasRenderingContext2D, e: Env, w: number): void;
};

/* ---------- shading (film shadeLight / shadeDark, dithered instead of mixed) ---------- */
export function shade(p: Pt, o: O, e: Env, bias: number, gk: number) {
  const d = o.d;
  if (!e.dark(o.y)) {
    o.c = K.L + Math.round(Math.pow(d, 1.25) * 15);
    if (p.r2 < bias && sm(0.05, 0.95, o.nx) * 0.9 > p.r7) o.c = d > 0.55 ? K.GREEN : K.DEEP;
  } else {
    o.c = K.D + Math.round(Math.pow(d, 1.1) * 15);
    if (p.r2 < bias && sm(0.05, 0.95, o.nx) * 0.9 > p.r7) o.c = K.MINT;
  }
  o.a = 0.14 + 0.86 * d;
  o.s = grain(p) * (0.45 + 0.8 * d) * o.f * gk;
  o.h = 0;
}
/** accent colour that works on the zone the point sits in */
export const accent = (e: Env, y: number) => (e.dark(y) ? K.MINT : K.GREEN);
export const inkOf = (e: Env, y: number) => (e.dark(y) ? K.BONE : K.INK);

/* ---------- bucketed square drawing ---------- */
export class Batch {
  private b: number[][] = [];
  private used: number[] = [];
  add(c: number, a: number, h: number, x: number, y: number, s: number) {
    const aq = Math.min(10, Math.round(a * 10));
    if (aq <= 0) return;
    const key = (h ? 512 : 0) + c * 11 + aq;
    let arr = this.b[key];
    if (!arr) arr = this.b[key] = [];
    if (!arr.length) this.used.push(key);
    arr.push(x - s / 2, y - s / 2, s);
  }
  flush(g: CanvasRenderingContext2D) {
    for (const key of this.used) {
      const arr = this.b[key];
      const hollow = key >= 512;
      const k = key & 511;
      const col = PALETTE[(k / 11) | 0];
      g.globalAlpha = (k % 11) / 10;
      g.beginPath();
      for (let i = 0; i < arr.length; i += 3) g.rect(arr[i], arr[i + 1], arr[i + 2], arr[i + 2]);
      if (hollow) {
        g.strokeStyle = col;
        g.lineWidth = 1.25;
        g.stroke();
      } else {
        g.fillStyle = col;
        g.fill();
      }
      arr.length = 0;
    }
    this.used.length = 0;
    g.globalAlpha = 1;
  }
}

/* ---------- construction hairlines (film guideBox) ---------- */
export function guideBox(g: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number, pr: number, al: number, col: string, ext = 56) {
  if (al <= 0.01 || pr <= 0) return;
  g.save();
  g.strokeStyle = col;
  g.lineWidth = 1;
  g.globalAlpha = al;
  const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
  const lw = (2 * hw + 2 * ext) * pr, lh = (2 * hh + 2 * ext) * pr;
  g.beginPath();
  g.moveTo(x0 - ext, y0); g.lineTo(x0 - ext + lw, y0);
  g.moveTo(x1 + ext, y1); g.lineTo(x1 + ext - lw, y1);
  g.moveTo(x0, y1 + ext); g.lineTo(x0, y1 + ext - lh);
  g.moveTo(x1, y0 - ext); g.lineTo(x1, y0 - ext + lh);
  g.stroke();
  g.globalAlpha = Math.min(1, al * 1.6);
  g.beginPath();
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    g.moveTo(x - 6, y); g.lineTo(x + 6, y);
    g.moveTo(x, y - 6); g.lineTo(x, y + 6);
  }
  g.stroke();
  g.globalAlpha = al;
  g.beginPath();
  const step = Math.max(24, (x1 - x0) / 16);
  for (let x = x0 + step, n = 1; x < x1 - 1; x += step, n++) {
    const k = n % 4 === 0 ? 7 : 3;
    g.moveTo(x, y1); g.lineTo(x, y1 + k);
  }
  g.stroke();
  g.restore();
}
