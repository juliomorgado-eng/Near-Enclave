// Shared module-grid helpers for v4B-NEAR-1B (copied from v4b-near, plus a pausable loop).
export const C = {
  green: '#00DC8D',
  lime: '#BFF988',
  ink: '#1C1917',
  dark: '#524E48',
  w500: '#79716B',
  w400: '#ABA29D',
  w300: '#D6D3D1',
  light: '#F5F5F5',
};

/** deterministic hash 0..1 per integer pair */
export function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export type Surface = { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number };

/** size a canvas to its CSS box, DPR capped at 2. Returns false if the box is empty. */
export function fit(s: Surface): boolean {
  const r = s.cv.getBoundingClientRect();
  const w = Math.round(r.width);
  const h = Math.round(r.height);
  if (!w || !h) return false;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (w !== s.w || h !== s.h || dpr !== s.dpr) {
    s.w = w;
    s.h = h;
    s.dpr = dpr;
    s.cv.width = Math.round(w * dpr);
    s.cv.height = Math.round(h * dpr);
  }
  s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

export function surface(cv: HTMLCanvasElement): Surface | null {
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  return { cv, ctx, w: 0, h: 0, dpr: 1 };
}

/** pseudo-random 0..1 per index, stable */
export const rand1 = (i: number) => hash(i, 7919);

/**
 * rAF loop that only runs while its element is on screen, the tab is visible and nothing
 * paused it (the request modal). fps caps the step rate.
 */
export function makeLoop(el: Element, step: (dt: number, now: number) => void, fps = 60) {
  let raf = 0, running = false, paused = false, visible = false, last = 0, acc = 0;
  const min = 1000 / fps - 1;
  const tick = (now: number) => {
    raf = 0;
    if (!running || paused || !visible || document.hidden) { last = 0; return; }
    const dt = last ? now - last : 16;
    last = now;
    acc += dt;
    if (acc >= min) {
      step(Math.min(0.05, acc / 1000), now);
      acc = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf && running && !paused && visible && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    kick();
  });
  io.observe(el);
  document.addEventListener('visibilitychange', kick);
  return {
    start() { running = true; kick(); },
    stop() { running = false; },
    pause(p: boolean) { paused = p; kick(); },
    get on() { return running && !paused && visible && !document.hidden; },
  };
}

/**
 * Fine dot texture: 1 CSS px squares on a `gap` px lattice, drawn once into a canvas the size
 * of the surface (device pixels). Used as a static backdrop, never as a module grid.
 */
export function dotLayer(w: number, h: number, dpr: number, gap: number, color: string, alpha: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const ctx = cv.getContext('2d')!;
  const s = Math.max(1, Math.round(dpr));
  const g = Math.round(gap * dpr);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let y = Math.round(g / 2); y < cv.height; y += g) for (let x = Math.round(g / 2); x < cv.width; x += g) ctx.rect(x, y, s, s);
  ctx.fill();
  ctx.globalAlpha = 1;
  return { cv, ctx };
}
