// v4B-NEAR-2A — the stage: one fixed canvas, one point pool, one scene per section.
// Each section exposes empty [data-slot="name"] boxes; a scene draws its form into them.
// As the next section's slot scrolls in, every point morphs (film inOut, staggered) from
// the current form into the next one, so the cloud travels down the page with the reader.
// Points in night/ink zones are shaded with the film's dark palette (its circular wipe,
// here a section edge). Reduced motion: no loop; every visible slot shows its final frame.
import {
  Batch, K, cl, eInOut, lerp, newO, rng,
  type Env, type LogoPts, type O, type Params, type Pt, type Rect, type Scene,
} from './film';
import { SCENES } from './scenes';

type Slot = { name: string; scene: Scene; els: HTMLElement[]; rects: Rect[]; k: number; age: number; env: Env };

export type Stage = {
  P: Params;
  start(): void;
  setPaused(p: boolean): void;
  invalidate(): void;
  onSolid(fn: (v: number) => void): void;
};

export function createStage(cv: HTMLCanvasElement, opts: { reduce: boolean }): Stage | null {
  const g = cv.getContext('2d');
  if (!g) return null;
  const reduce = opts.reduce;

  /* ---------- pool ---------- */
  const small = Math.min(innerWidth, innerHeight) < 600 || innerWidth < 768;
  const N = small ? 2400 : 4000;
  const D = Math.round(N * 0.07);
  const M = N - D;
  const R = rng(23);
  const P: Pt[] = [];
  for (let i = 0; i < N; i++) P.push({ r1: R(), r2: R(), r3: R(), r4: R(), r5: R(), r6: R(), r7: R() });
  const perm = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const rank = new Int32Array(N);
  perm.forEach((p, k) => (rank[p] = k));

  /* ---------- slots → scenes, in document order ---------- */
  const params: Params = { shift: 0, stat: -1, aud: 0, logo: null };
  const darkEls = [...document.querySelectorAll<HTMLElement>('.is-night, .is-ink')];
  const darkR: number[] = [];
  const dark = (y: number) => {
    for (let i = 0; i < darkR.length; i += 2) if (y >= darkR[i] && y < darkR[i + 1]) return true;
    return false;
  };
  const slots: Slot[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-slot]')) {
    const name = el.dataset.slot!;
    const scene = SCENES[name];
    if (!scene) continue;
    let s = slots.find((x) => x.name === name);
    if (!s) {
      s = { name, scene, els: [], rects: [], k: 0, age: 0, env: null as unknown as Env };
      s.env = { t: 0, age: 0, rects: s.rects, vw: 0, vh: 0, N, M, dark, P: params, reduce };
      slots.push(s);
    }
    s.els.push(el);
    s.rects.push({ x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 });
  }
  if (!slots.length) return null;

  /* ---------- logo points for the footer (film: sampled from the wordmark image) ---------- */
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const LW = 1060, LH = 260;
    const oc = document.createElement('canvas');
    oc.width = LW; oc.height = LH;
    const og = oc.getContext('2d', { willReadFrequently: true });
    if (!og) return;
    og.drawImage(img, 0, 0, LW, LH);
    const d = og.getImageData(0, 0, LW, LH).data;
    let step = 3;
    let pts: number[] = [];
    for (;;) {
      pts = [];
      for (let y = step >> 1; y < LH; y += step)
        for (let x = step >> 1; x < LW; x += step) {
          const k = (y * LW + x) * 4;
          if (d[k + 3] > 140) pts.push(x, y, d[k] < 120 && d[k + 1] > 150 ? 1 : 0);
        }
      if (pts.length / 3 <= M || step > 12) break;
      step++;
    }
    // sort by x so the morph sweeps left to right (film)
    const idx = [...Array(pts.length / 3).keys()].sort((a, b) => pts[a * 3] - pts[b * 3]).slice(0, M);
    const L: LogoPts = { u: new Float32Array(idx.length), v: new Float32Array(idx.length), mark: new Uint8Array(idx.length), n: idx.length, step };
    idx.forEach((q, i) => { L.u[i] = pts[q * 3] / LW; L.v[i] = pts[q * 3 + 1] / LH; L.mark[i] = pts[q * 3 + 2]; });
    params.logo = L;
    if (reduce) once();
  };
  img.src = '/v4b-near-2a/near-primary-dark.svg';

  /* ---------- sizing ---------- */
  let W = 0, H = 0, dpr = 1;
  function fit() {
    const w = innerWidth, h = innerHeight, r = Math.min(2, devicePixelRatio || 1);
    if (w !== W || h !== H || r !== dpr) {
      W = w; H = h; dpr = r;
      cv.width = Math.round(w * r);
      cv.height = Math.round(h * r);
    }
    g!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function measure() {
    darkR.length = 0;
    for (const el of darkEls) { const r = el.getBoundingClientRect(); darkR.push(r.top, r.bottom); }
    for (const s of slots) {
      s.els.forEach((el, i) => {
        const b = el.getBoundingClientRect();
        const r = s.rects[i];
        r.x = b.left; r.y = b.top; r.w = b.width; r.h = b.height; r.cx = b.left + b.width / 2; r.cy = b.top + b.height / 2;
      });
    }
  }

  /** union of a slot's boxes */
  const span = (s: Slot) => {
    let top = Infinity, bot = -Infinity;
    for (const r of s.rects) { if (r.w === 0 && r.h === 0) continue; top = Math.min(top, r.y); bot = Math.max(bot, r.y + r.h); }
    return [top, bot];
  };
  /** how far the slot has entered: 0 until its top passes 90% of the viewport, 1 at ~38% */
  const enter = (s: Slot) => {
    const [top] = span(s);
    if (!isFinite(top)) return 0;
    return cl((H * 0.9 - top) / (H * 0.52));
  };

  /* ---------- dust: sparse accent squares around the active form (film) ---------- */
  function dust(s: Slot, p: Pt, t: number, o: O) {
    const r = s.rects[0];
    const ext = (s.scene.extent ?? 0.5) * Math.min(r.w, r.h);
    const ang = p.r1 * 6.283, rad = ext * (1.0 + p.r2 * 0.32);
    o.x = r.cx + Math.cos(ang) * rad * 1.15 + Math.sin(t * 0.5 + p.r3 * 6.3) * 6;
    o.y = r.cy + Math.sin(ang) * rad * 0.95 + Math.cos(t * 0.4 + p.r4 * 6.3) * 6;
    o.d = 0.6; o.nx = 0; o.f = 1;
    const dk = dark(o.y), k = p.r6, gk = Math.min(1, ext / 320) * 0.45 + 0.2;
    if (!s.scene.dust) { o.a = 0; o.s = 0; o.c = K.INK; o.h = 0; return; }
    if (k < 0.035) { o.c = dk ? K.MINT : K.GREEN; o.s = (7 + p.r5 * 5) * gk; o.h = 0; o.a = 0.95; }
    else if (k < 0.06) { o.c = dk ? K.BONE : K.DEEP; o.s = (6 + p.r5 * 4) * gk; o.h = 0; o.a = dk ? 0.5 : 0.8; }
    else if (k < 0.1) { o.c = dk ? K.BONE : K.WARM; o.s = (9 + p.r5 * 3) * gk; o.h = 1; o.a = 0.5; }
    else if (k < 0.4) { o.c = dk ? K.BONE : K.INK; o.s = 2 * gk; o.h = 0; o.a = 0.4; }
    else { o.a = 0; o.s = 0; o.c = K.INK; o.h = 0; }
    o.a *= cl((s.age - 0.6 - p.r1 * 1.0) / 0.4);
  }

  function poseOf(s: Slot, i: number, rk: number, o: O) {
    if (rk >= M) dust(s, P[i], s.env.t, o);
    else s.scene.pose(rk, P[i], s.env, o);
  }

  /* ---------- draw ---------- */
  const batch = new Batch();
  const oA = newO(), oB = newO(), oC = newO(), oM = newO();
  const pad = 24;
  const put = (o: O) => {
    if (o.a <= 0.01 || o.s < 0.5) return;
    if (o.x < -pad || o.x > W + pad || o.y < -pad || o.y > H + pad) return;
    batch.add(o.c, o.a, o.h, o.x, o.y, o.s);
  };
  const mixInto = (a: O, b: O, k: number, out: O) => {
    out.x = lerp(a.x, b.x, k); out.y = lerp(a.y, b.y, k); out.s = lerp(a.s, b.s, k); out.a = lerp(a.a, b.a, k);
    out.h = k < 0.5 ? a.h : b.h; out.c = k < 0.5 ? a.c : b.c;
  };
  const clampY = (o: O) => { o.y = cl(o.y, -H * 0.22, H * 1.22); };

  let t = 0, last = 0, raf = 0, running = false, paused = false;
  let solidFn: ((v: number) => void) | null = null, lastSolid = -1;
  const footer = slots.find((s) => s.name === 'footer');
  const sheet = document.querySelector<HTMLElement>('.sheet');

  function prep(s: Slot) {
    s.env.t = t; s.env.age = s.age; s.env.vw = W; s.env.vh = H;
    s.scene.prepare(s.env);
  }

  function render(dt: number) {
    fit();
    measure();
    // the last slot (footer logo) also completes as the page bottoms out
    const rest = document.documentElement.scrollHeight - scrollY - H;
    const end = cl(1 - rest / (H * 0.3));
    for (const s of slots) {
      s.k = enter(s);
      if (s === slots[slots.length - 1] && s.k > 0) s.k = Math.max(s.k, end);
      if (reduce) { s.age = 99; continue; }
      if (s.k > 0.02) s.age += dt; else s.age = 0;
    }
    // hero is on stage from the first frame
    slots[0].k = 1;

    // footer solid logo
    if (footer && solidFn) {
      const v = reduce ? 1 : footer.k > 0.02 ? eInOut(cl((footer.age - 2.1) / 0.6)) : 0;
      if (Math.abs(v - lastSolid) > 0.002) { lastSolid = v; solidFn(v); }
    }

    g!.clearRect(0, 0, W, H);
    if (sheet) {
      const b = sheet.getBoundingClientRect();
      g!.save();
      g!.beginPath();
      g!.rect(b.left, 0, b.width, H);
      g!.clip();
    }
    try { draw(); } finally { if (sheet) g!.restore(); }
  }

  function draw() {

    if (reduce) {
      // every visible slot shows its own final frame
      for (const s of slots) {
        const [top, bot] = span(s);
        if (bot < -50 || top > H + 50) continue;
        prep(s);
        for (let i = 0; i < N; i++) { poseOf(s, i, rank[i], oB); put(oB); }
        batch.flush(g!);
        s.scene.overlay?.(g!, s.env, 1);
      }
      return;
    }

    // active = deepest slot that has started to enter
    let a = 0;
    for (let i = 1; i < slots.length; i++) if (slots[i].k > 0) a = i;
    const S = slots[a], k = S.k;
    const prev = a > 0 && k < 1 ? slots[a - 1] : null;
    const prev2 = prev && a > 1 && prev.k < 1 ? slots[a - 2] : null;

    // nothing to draw: the active form has scrolled away
    const [top, bot] = span(S);
    if (!prev && (bot < -H * 0.3 || top > H * 1.3)) return;

    prep(S);
    if (prev) prep(prev);
    if (prev2) prep(prev2);

    for (let i = 0; i < N; i++) {
      const rk = rank[i], p = P[i];
      poseOf(S, i, rk, oB);
      if (!prev) { put(oB); continue; }
      poseOf(prev, i, rk, oA);
      if (prev2) {
        poseOf(prev2, i, rk, oC);
        clampY(oC);
        const k2 = eInOut(cl((prev.k - p.r1 * 0.4) / 0.6));
        mixInto(oC, oA, k2, oA);
      }
      clampY(oA);
      const kp = eInOut(cl((k - p.r1 * 0.4) / 0.6));
      if (kp >= 1) { put(oB); continue; }
      if (kp <= 0) { put(oA); continue; }
      mixInto(oA, oB, kp, oM);
      put(oM);
    }
    batch.flush(g!);
    S.scene.overlay?.(g!, S.env, prev ? cl((k - 0.5) / 0.5) : 1);
    if (prev) prev.scene.overlay?.(g!, prev.env, cl(1 - k * 2));
  }

  function tick(now: number) {
    raf = 0;
    if (!running || paused || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    t += dt;
    render(dt);
    raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && running && !paused && !document.hidden) raf = requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange', kick);

  // reduced motion: draw on demand (scroll / resize / logo ready)
  let pend = 0;
  const once = () => {
    if (pend) return;
    pend = requestAnimationFrame(() => { pend = 0; render(0); });
  };
  if (reduce) {
    addEventListener('scroll', once, { passive: true });
    addEventListener('resize', once);
  }

  return {
    P: params,
    start() {
      if (reduce) { once(); return; }
      running = true;
      kick();
    },
    setPaused(p) { paused = p; kick(); },
    invalidate() { if (reduce) once(); },
    onSolid(fn) { solidFn = fn; },
  };
}
