// v3D-NEAR — "Sealed invitation" boot.
// One glass invitation travels the page in its own column, co-starring with the copy:
//   Hero   — sealed in its frosted sleeve, turning slowly; reaching for "Apply" opens it toward the button.
//   Shift  — it turns over; the back's plain records are redacted sentence by sentence, and the
//            N seal lights at "Privacy is the missing primitive."
//   Stats  — it is pushed into a reader slot; that gesture unlocks the figures.
//   Format — it arrives: face-on, opened, resting on a single stage line, the N lit.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, smooth, lerp, clamp, onReveal, checkPendingReveals, scrollTargetY } from '../v3/util';
import { createScene, AR, type Scene } from './scene';

declare global {
  interface Window {
    __vdnReady?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
let lenis: Lenis | null = null;
let scene: Scene | null = null;
const columnMQ = matchMedia('(min-width: 768px)');

const live = {
  intro: reduceMotion ? 1 : 0,
  hoverT: 0,
  hover: 0,
  shiftP: 0,
  statsP: 0,
  pxT: 0,
  pyT: 0,
  px: 0,
  py: 0,
  sweep: -1,
};
// damped pose, so scroll-driven targets never snap
const cur = { x: 0.5, y: 0, h: 0.3, rx: 0, ry: 0.26, rz: 0, open: 0, frost: 1, opacity: 0, redact: 0, seal: 0, glow: 0, ins: 0, init: false };

/* ------------------------------------------------------------------ */
/* placement from the DOM anchors                                     */
/* ------------------------------------------------------------------ */
type Place = { x: number; y: number; h: number; c: number };
function place(el: HTMLElement | null): Place {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (!el) return { x: 0, y: -3, h: 0.2, c: 9 };
  const r = el.getBoundingClientRect();
  const hpx = Math.min(r.height, r.width / AR) * 0.86;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return { x: (cx / W) * 2 - 1, y: 1 - (cy / H) * 2, h: hpx / H, c: cy / H };
}
const A = {
  hero: $('[data-anchor="hero"]'),
  shift: $('[data-anchor="shift"]'),
  shiftm: $('[data-anchor="shiftm"]'),
  stats: $('[data-anchor="stats"]'),
  format: $('[data-anchor="format"]'),
};
const slot = $('[data-slot]');
const TAU = Math.PI * 2;

// Shift: how far each sentence has been read (0…1), from its position on screen
function readProgress() {
  const H = window.innerHeight;
  return sentences.map((el) => {
    const r = el.getBoundingClientRect();
    return smooth(0.8, 0.5, (r.top + r.height / 2) / H);
  });
}

let time = 0;
let unlocked = false;
function poseCard(dt: number) {
  if (!scene) return;
  time += dt;
  const desk = columnMQ.matches;
  const els = [A.hero, desk ? A.shift : A.shiftm, A.stats, A.format];
  const ps = els.map(place);
  const ds = ps.map((p) => Math.abs(p.c - 0.5));
  // nearest anchor, and whichever neighbour (in page order) is closer — the card only travels to adjacent chapters
  let i0 = 0;
  for (let i = 1; i < 4; i++) if (ds[i] < ds[i0]) i0 = i;
  const nb = [i0 - 1, i0 + 1].filter((i) => i >= 0 && i < 4);
  const i1 = nb.length > 1 && ds[nb[1]] < ds[nb[0]] ? nb[1] : nb[0];
  const w = [0, 0, 0, 0];
  let target: { x: number; y: number; h: number };
  let opacity: number;
  if (desk) {
    // every anchor sits in the same right-hand column: the card glides between them, never over copy
    const t = ds[i0] / Math.max(1e-4, ds[i0] + ds[i1]);
    w[i0] = 1 - t;
    w[i1] = t;
    target = { x: lerp(ps[i0].x, ps[i1].x, t), y: lerp(ps[i0].y, ps[i1].y, t), h: lerp(ps[i0].h, ps[i1].h, t) };
    opacity = 1 - smooth(0.55, 0.85, ds[i0]);
  } else {
    // phone: anchors sit between blocks; the card fades out at one and back in at the next
    w[i0] = 1;
    target = ps[i0];
    opacity = (1 - smooth(0.42, 0.62, ds[i0])) * smooth(0.0, 0.12, ds[i1] - ds[i0]);
  }

  // Shift: turn over to the back as the argument starts, then seal the records sentence by sentence
  let flip: number;
  let redact: number;
  let seal: number;
  if (desk) {
    const rp = readProgress();
    flip = smooth(0.0, 0.6, rp[0]);
    redact = rp.reduce((x, y) => x + y, 0);
    seal = rp[2];
  } else {
    const local = smooth(0.95, 0.25, ps[1].c);
    flip = smooth(0.0, 0.3, local);
    redact = 4 * smooth(0.25, 0.85, local);
    seal = smooth(0.55, 0.8, local);
  }

  // Stats: pushed into the reader slot; the figures unlock once it is in
  let ins: number;
  if (desk) ins = smooth(0.12, 0.42, live.statsP) * (1 - smooth(0.8, 0.97, live.statsP));
  else ins = smooth(0.62, 0.4, ps[2].c);
  ins *= smooth(0.4, 0.8, w[2]);
  if (ins > 0.86 && !unlocked) {
    unlocked = true;
    stats.forEach((r, i) => gsap.delayedCall(i * 0.16, () => countUp(r)));
  }

  const hv = live.hover;
  const sway = Math.sin(time * 0.16);
  const ryC = [
    0.26 + sway * 0.06 + live.px * 0.06,
    Math.PI * flip + sway * 0.05 * (1 - Math.abs(flip - 0.5) * 2) + Math.sin(time * 0.11) * 0.05,
    TAU,
    TAU - 0.14 + sway * 0.05,
  ];
  const rxC = [-0.05 + Math.sin(time * 0.12) * 0.025 - live.py * 0.04, 0.05, 0, 0.03];
  const rzC = [0.025, -0.02, 0, 0];
  const frostC = [1, 0.85, 0.9, 0.45];
  const openC = [0, 0, 0, 0.42];
  const ry = w.reduce((acc, wi, i) => acc + wi * ryC[i], 0);
  const rx = w.reduce((acc, wi, i) => acc + wi * rxC[i], 0);
  const rz = w.reduce((acc, wi, i) => acc + wi * rzC[i], 0);
  const frostB = w.reduce((acc, wi, i) => acc + wi * frostC[i], 0);
  const openB = w.reduce((acc, wi, i) => acc + wi * openC[i], 0);
  // reaching for the CTA opens it and turns it toward the button (hero), or a little more (stage)
  const reach = hv * (w[0] + 0.6 * w[3]);

  const k = desk ? 1 - Math.exp(-dt * 9) : 1;
  const kr = 1 - Math.exp(-dt * 2.4);
  const ko = 1 - Math.exp(-dt * 2.6);
  if (!cur.init) {
    Object.assign(cur, target, { rx, ry, rz });
    cur.init = true;
  }
  cur.x += (target.x - cur.x) * k;
  cur.y += (target.y - cur.y) * k;
  cur.h += (target.h - cur.h) * k;
  cur.rx += (lerp(rx, 0.12, hv * w[0]) - cur.rx) * kr;
  cur.ry += (lerp(ry, -0.34, hv * w[0]) - cur.ry) * kr;
  cur.rz += (lerp(rz, 0, reach) - cur.rz) * kr;
  cur.open += (Math.max(openB, reach) - cur.open) * ko;
  cur.frost += (lerp(frostB, 0.12, reach) - cur.frost) * ko;
  cur.opacity += (opacity - cur.opacity) * (1 - Math.exp(-dt * 6));
  cur.redact += (redact - cur.redact) * ko;
  cur.seal += (seal - cur.seal) * ko;
  cur.glow += (w[3] - cur.glow) * ko;
  cur.ins += (ins - cur.ins) * (1 - Math.exp(-dt * 5));

  const p = scene.pose;
  const intro = live.intro;
  p.x = cur.x;
  p.h = cur.h * (1 + cur.open * 0.04 * (1 - cur.glow)) * lerp(0.94, 1, intro);
  p.y = cur.y - (1 - intro) * 0.06 - cur.ins * p.h * 2 * 0.62;
  p.rx = cur.rx;
  p.ry = cur.ry + (1 - intro) * -0.35;
  p.rz = cur.rz;
  p.open = cur.open;
  p.frost = cur.frost;
  p.opacity = cur.opacity * intro;
  p.redact = cur.redact;
  p.seal = cur.seal;
  p.glow = cur.glow;
  if (slot && cur.ins > 0.002) {
    const r = slot.getBoundingClientRect();
    p.clipY = r.top + r.height / 2;
  } else p.clipY = -1;
  // an idle glint every ~14 s; reaching for the CTA sends one across
  p.sweep = live.sweep >= 0 ? live.sweep : (time % 14) / 6 - 0.4;
  p.time = time;
}

/* ------------------------------------------------------------------ */
/* Shift, Stats, reveals                                               */
/* ------------------------------------------------------------------ */
const sentences = $$('[data-shift-s]');
function initShift() {
  ScrollTrigger.create({
    trigger: '#shift',
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (s) => void (live.shiftP = s.progress),
  });
  sentences.forEach((s) =>
    ScrollTrigger.create({
      trigger: s,
      start: 'top 72%',
      onEnter: () => s.classList.add('is-on'),
      onLeaveBack: () => s.classList.remove('is-on'),
    }),
  );
}

const stats = $$('[data-stat]');
function fmt(v: number, dec: number) {
  return v.toFixed(dec);
}
function countUp(row: HTMLElement) {
  if (row.classList.contains('is-in')) return;
  row.classList.add('is-in');
  const el = $('[data-stat-val]', row);
  if (!el) return;
  const pre = el.dataset.prefix ?? '';
  const suf = el.dataset.suffix ?? '';
  const n = parseFloat(el.dataset.number ?? '0');
  const dec = parseInt(el.dataset.dec ?? '0', 10);
  const final = el.textContent ?? '';
  if (el.dataset.to) {
    // ranges ($3–5T) never show a fake intermediate: the final value fades up
    gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out' });
    return;
  }
  // count from 40 % of the value so the first frames already read as a real figure
  const st = { v: 0.4 };
  gsap.set(el, { opacity: 1 });
  el.textContent = `${pre}${fmt(n * st.v, dec)}${suf}`;
  gsap.to(st, {
    v: 1,
    duration: 1.2,
    ease: 'power3.out',
    onUpdate: () => void (el.textContent = `${pre}${fmt(n * st.v, dec)}${suf}`),
    onComplete: () => void (el.textContent = final),
  });
}
function initStats() {
  ScrollTrigger.create({
    trigger: '#stats',
    start: 'top 75%',
    end: 'bottom 25%',
    onUpdate: (s) => void (live.statsP = s.progress),
  });
  // without the card (no WebGL), or if the reader is skipped, the figures still unlock on their own
  stats.forEach((r) => onReveal(r, () => countUp(r), scene ? 'top 35%' : 'top 85%'));
}

function initReveals() {
  $$('[data-lines]').forEach((el) =>
    onReveal(
      el,
      () => {
        gsap.set(el, { visibility: 'visible' });
        const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
        gsap.from(split.lines, {
          yPercent: 108,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.08,
          onComplete: () => split.revert(),
        });
      },
      'top 85%',
    ),
  );
}

function heroIntro() {
  const tl = gsap.timeline({ delay: 0.1 });
  // explicit from/to: inline values must outlive the CSS hidden state
  tl.fromTo('[data-hero-line]', { yPercent: 108, y: 0 }, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.08 }, 0);
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.3);
  tl.to(live, { intro: 1, duration: 2.2, ease: 'power3.out' }, 0.35);
  return tl;
}

/* ------------------------------------------------------------------ */
/* hover = reaching for the invitation                                 */
/* ------------------------------------------------------------------ */
function initHover() {
  let n = 0;
  const on = () => {
    n++;
    live.hoverT = 1;
    gsap.fromTo(live, { sweep: -0.05 }, { sweep: 1.05, duration: 1.6, ease: 'power2.inOut', overwrite: true, onComplete: () => void (live.sweep = -1) });
  };
  const off = () => {
    n = Math.max(0, n - 1);
    if (!n) live.hoverT = 0;
  };
  $$('[data-card-hover]').forEach((el) => {
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
  });
}

function scrollToHash(hash: string) {
  const target = hash.length > 1 ? $(hash) : null;
  if (!target && hash !== '#top') return false;
  const y = hash === '#top' || !target ? 0 : scrollTargetY(target);
  if (lenis) lenis.scrollTo(y, { duration: 1.4 });
  else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  history.replaceState(null, '', hash);
  return true;
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();

  const canvas = $<HTMLCanvasElement>('[data-gl]');
  const lowTier = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  if (canvas && !reduceMotion) {
    try {
      scene = createScene(canvas, { lowTier });
    } catch (err) {
      scene = null;
      console.info('[v3d-near] WebGL unavailable, using CSS card.', err);
    }
  }
  root.classList.add(scene ? 'gl-on' : 'no-gl');

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.085, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  window.addEventListener('request:open', () => {
    lenis?.stop();
    scene?.pause(true);
  });
  window.addEventListener('request:close', () => {
    lenis?.start();
    scene?.pause(false);
  });

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    if (a.classList.contains('skip')) return;
    a.addEventListener('click', (e) => {
      if (scrollToHash(a.getAttribute('href') || '')) e.preventDefault();
    });
  });

  if (finePointer) {
    window.addEventListener(
      'pointermove',
      (e) => {
        live.pxT = (e.clientX / window.innerWidth) * 2 - 1;
        live.pyT = (e.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }

  let motionOk = true;
  if (!reduceMotion) {
    for (const fn of [initShift, initStats, initReveals, initHover]) {
      try {
        fn();
      } catch (err) {
        motionOk = false;
        console.info('[v3d-near] motion skipped:', err);
      }
    }
  }
  if (!motionOk || reduceMotion) {
    root.classList.remove('vdn-motion');
    sentences.forEach((s) => s.classList.add('is-on'));
    stats.forEach((r) => r.classList.add('is-in'));
    live.intro = 1;
  } else {
    try {
      heroIntro();
    } catch {
      root.classList.remove('vdn-motion');
      live.intro = 1;
    }
  }

  gsap.ticker.add((_t, dms) => {
    const dt = Math.min(dms / 1000, 1 / 20);
    const kh = 1 - Math.exp(-dt * 3);
    live.hover += (live.hoverT - live.hover) * kh;
    live.px += (live.pxT - live.px) * kh * 0.5;
    live.py += (live.pyT - live.py) * kh * 0.5;
    if (scene) {
      poseCard(dt);
      scene.tick(dt);
    }
  });
  if (scene) {
    const sc = scene;
    sc.compile();
    document.addEventListener('visibilitychange', () => sc.pause(document.hidden));
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) sc.dispose();
    });
  }

  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  start();
  document.fonts?.ready.then(start);
  window.addEventListener('load', start, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('vdn-motion');
  root.classList.add('no-gl');
  console.info('[v3d-near] boot failed, static page shown.', err);
}
window.__vdnReady = true;
