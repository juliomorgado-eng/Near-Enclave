// NEAR Enclave 2027 — v3D-NEARCON "Sealed invitation".
// The page is editorial; the card is a small sealed invitation that waits beside the CTA.
// Hovering or focusing "Apply to Attend" opens it a little (frost clears, the card turns to you).
// In The Shift and Stats it keeps company from a side cell, turning slowly with the scroll.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, smooth, lerp, clamp, onReveal, checkPendingReveals } from '../v3/util';
import { createScene, CW, CH, type Scene } from './scene';

declare global {
  interface Window {
    __vdnready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const AR = CW / CH;
let lenis: Lenis | null = null;
let scene: Scene | null = null;

const live = {
  intro: reduceMotion ? 1 : 0,
  open: 0,
  openT: 0,
  sweep: -1,
  theme: 0,
  cur: 0,
  fade: 0,
  shiftP: 0,
  statsP: 0,
  ins: 0,
  px: 0,
  py: 0,
  pxT: 0,
  pyT: 0,
};

/* ------------------------------------------------------------------ */
/* Card placement from DOM anchors (the anchor box is the card)        */
/* ------------------------------------------------------------------ */
const desktopMQ = matchMedia('(min-width: 1024px) and (min-height: 640px)');
const TAU = Math.PI * 2;
type Place = { x: number; y: number; s: number; c: number; long: number; on: boolean };
function place(el: HTMLElement | null, portrait = false, fill = 0.9): Place {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (!el) return { x: 0, y: 0, s: 0, c: 9, long: 0, on: false };
  const r = el.getBoundingClientRect();
  const short = (portrait ? Math.min(r.width, r.height / AR) : Math.min(r.height, r.width / AR)) * fill;
  const cy = r.top + r.height / 2;
  return {
    x: ((r.left + r.width / 2) / W) * 2 - 1,
    y: 1 - (cy / H) * 2,
    s: short / H,
    c: cy / H,
    long: short * AR,
    on: r.width > 4 && r.bottom > 0 && r.top < H,
  };
}
const lp = (a: Place, b: Place, t: number): Place => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  s: lerp(a.s, b.s, t),
  c: lerp(a.c, b.c, t),
  long: lerp(a.long, b.long, t),
  on: true,
});

const A = {
  hero: $('[data-anchor="hero"]'),
  shift: $('[data-anchor="shift"]'),
  stats: $('[data-anchor="stats"]'),
  format: $('[data-anchor="format"]'),
};
const S = { shift: $('#shift'), stats: $('#stats'), format: $('#format') };
const slot = $('[data-slot]');
const readerBody = $('[data-reader-body]');
const reader = $('[data-reader]');
const top = (el: HTMLElement | null) => el?.getBoundingClientRect().top ?? 1e5;

// Shift (pinned on desktop): flip → redact the record row by row → privacy seal pressed
const flipOf = (p: number) => smooth(0.02, 0.26, p);
const stepOf = (p: number) => clamp((p - 0.28) / 0.3, 0, 1) * 4;
const stampOf = (p: number) => smooth(0.6, 0.72, p);
// Stats (pinned on desktop): the card is inserted, then the figures unlock one by one
const insOf = (p: number) => smooth(0.02, 0.24, p);
const STAT_TH = [0.26, 0.34, 0.42, 0.5];

let time = 0;
function poseCard(dt: number) {
  if (!scene) return;
  time += dt;
  const H = window.innerHeight;
  live.open += (live.openT - live.open) * (1 - Math.exp(-dt * 3.2));
  live.px += (live.pxT - live.px) * (1 - Math.exp(-dt * 1.6));
  live.py += (live.pyT - live.py) * (1 - Math.exp(-dt * 1.6));

  const ph = place(A.hero, false, 0.94);
  const ps = place(A.shift, false, 0.94);
  const pt = place(A.stats, true, 0.98);
  const pf = place(A.format, false, 0.96);
  const sway = Math.sin(time * 0.22) * 0.22;
  const p = scene.pose;
  let base: Place;
  let t1 = 0;
  let t2 = 0;
  let t3 = 0;
  let t3late = 0;
  let flip = 0;
  let step = 0;
  let stamp = 0;
  let ins = 0;
  let land = 0;
  let opacity = 1;

  if (desktopMQ.matches) {
    // one continuous journey down the right-hand column; every hand-over is scroll-scrubbed
    t1 = smooth(H * 0.95, H * 0.02, top(S.shift));
    t2 = smooth(H * 0.95, H * 0.02, top(S.stats));
    // after the reader the card keeps going down through it and comes out below, still upright,
    // and only turns flat and grows once it is clear of the machine
    t3 = smooth(H * 0.95, H * 0.25, top(S.format));
    t3late = smooth(0.5, 1, t3);
    base = lp(lp(lp(ph, ps, t1), pt, t2), pf, t3);
    const sz = lp(lp(ph, ps, t1), pt, t2);
    base.s = lerp(sz.s, pf.s, t3late);
    base.long = lerp(sz.long, pf.long, t3late);
    flip = t2 > 0 ? 1 : flipOf(live.shiftP);
    step = t2 > 0 ? 4 : stepOf(live.shiftP);
    stamp = t2 > 0 ? 1 : stampOf(live.shiftP);
    ins = insOf(live.statsP) * t2 * (1 - t3);
    land = smooth(0.55, 1, t3);
  } else {
    // flow layout: the card rides with the anchor nearest the middle and hands over with a short fade
    const ps4 = [ph, ps, pt, pf];
    let want = live.cur;
    let best = 9;
    ps4.forEach((q, i) => {
      if (!q.on) return;
      const d = Math.abs(q.c - 0.5);
      if (d < best - 0.04 || (i === live.cur && d < best + 0.04)) {
        best = d;
        want = i;
      }
    });
    if (want !== live.cur) {
      live.fade += (0 - live.fade) * (1 - Math.exp(-dt * 10));
      if (live.fade < 0.03) live.cur = want;
    } else live.fade += (1 - live.fade) * (1 - Math.exp(-dt * 4));
    const i = live.cur;
    base = ps4[i];
    opacity = live.fade * (base.on ? 1 : 0);
    t1 = i >= 1 ? 1 : 0;
    t2 = i >= 2 ? 1 : 0;
    t3 = i >= 3 ? 1 : 0;
    t3late = t3;
    if (i === 1) {
      const k = smooth(0.95, 0.2, ps.c);
      flip = flipOf(k);
      step = stepOf(k);
      stamp = stampOf(k);
    } else if (i >= 2) {
      flip = 1;
      step = 4;
      stamp = 1;
    }
    if (i === 2) ins = smooth(0.78, 0.48, pt.c);
    if (i === 3) land = smooth(0.95, 0.55, pf.c);
  }
  live.ins = ins;

  const o = live.open * (1 - t1);
  p.x = base.x;
  // inserted only as deep as the reader body, so the card stays seated in the slot
  const depth = readerBody ? readerBody.getBoundingClientRect().height * 0.8 : base.long * 0.3;
  p.y = base.y + o * 0.01 - ((ins * depth) / H) * 2;
  p.s = base.s * (1 + o * 0.02) * lerp(0.9, 1, live.intro);
  // hero: sealed, turning slowly; Shift: turned over; Stats: back to the seal and upright into the reader;
  // Format: face up again, opened, standing on the stage line
  const ryHero = lerp(-0.2 + sway + live.px * 0.08, -0.5, o);
  const ryShift = Math.PI * flip + Math.sin(time * 0.2) * 0.06 * (1 - flip * 0.5);
  const ryStats = TAU;
  const ryFormat = TAU - 0.32 + Math.sin(time * 0.18) * 0.05;
  p.ry = lerp(lerp(lerp(ryHero, ryShift, t1), ryStats, t2), ryFormat, t3late) + (1 - live.intro) * -0.6;
  const rxHero = lerp(0.14 + Math.sin(time * 0.18) * 0.04 + live.py * 0.05, -0.12, o);
  p.rx = lerp(lerp(lerp(rxHero, 0.1, t1), 0, t2), 0.06, t3late);
  p.rz = lerp(lerp(lerp(0.04, -0.03, t1), -Math.PI / 2, t2), 0, t3late);
  p.opacity = live.intro * opacity;
  p.shadow = (1 - t2) + t3;
  // theme follows the ink chapter
  live.theme = clamp(t2 - t3 * 1.2, 0, 1);
  scene.setTheme(live.theme);
  scene.setRecord(step, stamp, land);
  const idle = t1 < 0.05 ? (time % 11) / 3.6 : -1;
  scene.setOpen(Math.max(o, land), live.sweep >= 0 ? live.sweep : idle);
  if (slot && readerBody) {
    const sr = slot.getBoundingClientRect();
    const br = readerBody.getBoundingClientRect();
    scene.setClip(br.left, br.right, sr.top + sr.height / 2, br.bottom, t2 > 0.5 && t3late < 0.2);
  }
  syncReader(ins);
}

let readerState = -1;
function syncReader(ins: number) {
  const st = ins < 0.04 ? 0 : ins < 0.97 ? 1 : 2;
  if (st === readerState) return;
  readerState = st;
  reader?.classList.toggle('is-reading', st === 1);
  reader?.classList.toggle('is-ok', st === 2);
  if (st === 2 && !desktopMQ.matches) checkPendingReveals();
}

const sentences = $$('[data-shift-s]');
let activeS = -1;
function setSentence(i: number) {
  if (i === activeS) return;
  activeS = i;
  sentences.forEach((el, j) => {
    el.classList.toggle('is-on', j === i);
    el.classList.toggle('is-past', j < i);
  });
}
const sentenceOf = (p: number) => (p < 0.27 ? 0 : p < 0.6 ? 1 : p < 0.8 ? 2 : 3);

function initPins(mm: gsap.MatchMedia) {
  mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
    const a = ScrollTrigger.create({
      trigger: '#shift',
      start: 'top top',
      end: '+=170%',
      pin: true,
      onUpdate: (self) => {
        live.shiftP = self.progress;
        setSentence(sentenceOf(self.progress));
      },
    });
    live.shiftP = a.progress;
    setSentence(sentenceOf(a.progress));
    const b = ScrollTrigger.create({
      trigger: '#stats',
      start: 'top top',
      end: '+=80%',
      pin: true,
      onUpdate: (self) => {
        live.statsP = self.progress;
        stats.forEach((r, i) => {
          if (self.progress >= STAT_TH[i]) unlock(r, i);
        });
      },
    });
    live.statsP = b.progress;
    return () => {
      live.shiftP = 0;
      live.statsP = 0;
    };
  });
  mm.add('not ((min-width: 1024px) and (min-height: 640px))', () => {
    const sts = sentences.map((el, i) =>
      ScrollTrigger.create({
        trigger: el,
        start: 'top 75%',
        end: 'bottom 35%',
        onToggle: (self) => {
          if (self.isActive) setSentence(i);
        },
      }),
    );
    // the figures unlock once the card is in the reader and the row is fully on screen
    stats.forEach((r, i) => onReveal(r, () => unlock(r, i), 'bottom 96%'));
    return () => sts.forEach((t) => t.kill());
  });
}

const stats = $$('[data-stat]');
function unlock(row: HTMLElement, i: number) {
  if (row.classList.contains('is-in')) return;
  const v = $('[data-stat-val]', row);
  row.classList.add('is-in');
  if (!v || reduceMotion) return;
  const final = v.textContent ?? '';
  const n = { a: 0, b: 0 };
  v.textContent = fmt(v, 0, 0);
  gsap.to(n, {
    a: Number(v.dataset.number || 0),
    b: Number(v.dataset.to || 0),
    duration: 1.1,
    delay: (i % 2) * 0.06,
    ease: 'power2.out',
    onUpdate: () => void (v.textContent = fmt(v, n.a, n.b)),
    onComplete: () => void (v.textContent = final),
  });
}

/* ------------------------------------------------------------------ */
/* Apply = open the invitation                                         */
/* ------------------------------------------------------------------ */
function initOpen() {
  const on = () => {
    live.openT = 1;
    gsap.fromTo(live, { sweep: -0.05 }, { sweep: 1.05, duration: 1.6, ease: 'power2.inOut', overwrite: true, onComplete: () => void (live.sweep = -1) });
    root.classList.add('is-open');
  };
  const off = () => {
    live.openT = 0;
    root.classList.remove('is-open');
  };
  $$('[data-card-hover]').forEach((el) => {
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
  });
}

/* ------------------------------------------------------------------ */
/* Reveals                                                             */
/* ------------------------------------------------------------------ */
function fmt(el: HTMLElement, a: number, b: number) {
  const d = Number(el.dataset.dec || 0);
  const to = el.dataset.to;
  return `${el.dataset.prefix ?? ''}${a.toFixed(d)}${to ? `–${b.toFixed(d)}` : ''}${el.dataset.suffix ?? ''}`;
}

function initReveals() {
  $$('[data-lines]').forEach((el) =>
    onReveal(
      el,
      () => {
        gsap.set(el, { visibility: 'visible' });
        const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
        gsap.from(split.lines, {
          yPercent: 105,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.09,
          onComplete: () => split.revert(),
        });
      },
      'top 85%',
    ),
  );

  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', clearProps: 'transform' }), 'top 88%'),
  );
}

function heroReveal() {
  const tl = gsap.timeline({ delay: 0.1 });
  tl.to(live, { intro: 1, duration: 1.8, ease: 'expo.out' }, 0.35);
  tl.to('[data-hero-line]', { y: 0, yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.08 }, 0);
  tl.to('[data-hero-fade]', { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, 0.3);
  tl.add(() => root.classList.add('vdn-in'), 0.2);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function scrollToHash(hash: string) {
  const target = hash.length > 1 ? $(hash) : null;
  const y = !target ? 0 : Math.max(0, target.getBoundingClientRect().top + window.scrollY);
  if (lenis) lenis.scrollTo(y, { duration: 1.2 });
  else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  history.replaceState(null, '', hash);
}

function settleStatic() {
  root.classList.remove('vdn-motion');
  live.intro = 1;
  $$('[data-stat]').forEach((r) => r.classList.add('is-in'));
  $$('[data-shift-s]').forEach((el) => el.classList.add('is-on'));
  $('[data-reader]')?.classList.add('is-ok');
}

function boot() {
  initRequestModal();

  const canvas = $<HTMLCanvasElement>('[data-gl]');
  const fg = $<HTMLCanvasElement>('[data-gl-fg]');
  const lowTier = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  if (canvas && fg && !reduceMotion) {
    try {
      scene = createScene(canvas, fg, { lowTier });
    } catch (err) {
      scene = null;
      console.info('[v3d-nearcon] WebGL unavailable, using the static seal.', err);
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
      e.preventDefault();
      scrollToHash(a.getAttribute('href') || '#top');
    });
  });

  if (finePointer) {
    window.addEventListener(
      'pointermove',
      (e) => {
        live.pxT = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
        live.pyT = clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
        scene?.setPointer(e.clientX, e.clientY);
      },
      { passive: true },
    );
  }

  const mm = gsap.matchMedia();
  let motionOk = !reduceMotion;
  if (motionOk) {
    for (const fn of [initReveals, initOpen, () => initPins(mm)]) {
      try {
        fn();
      } catch (err) {
        motionOk = false;
        console.info('[v3d-nearcon] motion skipped:', err);
      }
    }
  }
  if (!motionOk) settleStatic();
  else heroReveal();

  gsap.ticker.add((_t, dms) => {
    const dt = Math.min(dms / 1000, 1 / 20);
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
  settleStatic();
  console.info('[v3d-nearcon] boot failed, static page shown.', err);
}
window.__vdnready = true;
