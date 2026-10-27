// NEAR Enclave 2027 — v3B-NEARCON boot (fork of v3b/main.ts).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, checkPendingReveals, smooth, lerp, finePointer, scrollTargetY } from '../v3/util';
import { createScene, KEYS, type ChapterState, type Scene } from './scene';
import { runIntro } from './intro';
import { initModalFx } from './ui';
import { live, initReveals, heroReveal, initHero, initShift, initStats, initFormat } from './sections';

declare global {
  interface Window {
    __vncready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
let lenis: Lenis | null = null;
let scene: Scene | null = null;
const getLenis = () => lenis;

/* ------------------------------------------------------------------ */
/* Enclave placement: every chapter fits the slab to a live DOM anchor */
/* ------------------------------------------------------------------ */
const BASE: ChapterState = { field: 1, slab: 1, sx: 0.45, sy: 0, ss: 0.5, frost: 0.2, ox: 1.2, oy: 0, pass: 0.2, speed: 1, mark: 1, order: 0, stage: 0 };
type Place = { sx: number; sy: number; ss: number };

function placeOf(a: HTMLElement | null): Place | null {
  if (!a) return null;
  const r = a.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  // 0.9: the slab's depth + sway make it read slightly larger than its front face
  const ss = 0.9 * Math.min(r.height / H, ((r.width / W) * (W / H) * 3) / 2.2);
  return { sx: (cx / W) * 2 - 1, sy: 1 - (cy / H) * 2, ss };
}
/** beam target: the left edge / first line of the element being emitted */
function outOf(el: HTMLElement | null, p: Place): { ox: number; oy: number } {
  // stacked layouts (< 1024): copy sits below the slab, so the beam just exits right
  if (!el || window.innerWidth < 1024) return { ox: 1.2, oy: p.sy };
  const r = el.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const y = r.top + Math.min(r.height / 2, 28);
  return { ox: ((r.left - 14) / W) * 2 - 1, oy: 1 - (y / H) * 2 };
}

let shiftH2: HTMLElement | null = null;
let shiftP: HTMLElement | null = null;
let statsGrid: HTMLElement | null = null;
type Chapter = { key: string; sec: HTMLElement; anchor: HTMLElement | null; top: number; lead: number };
let chapters: Chapter[] = [];
function measure() {
  shiftH2 = $('[data-shift-h2]');
  shiftP = $('[data-shift-p]');
  statsGrid = $('[data-stats-grid]');
  chapters = $$('[data-chapter]').map((sec) => {
    const a = sec.querySelector<HTMLElement>('[data-slab-anchor]');
    const sp = sec.parentElement?.classList.contains('pin-spacer') ? sec.parentElement : sec;
    // lead: offset of the section's first copy (h2 / stats grid) from its top; the slab
    // hand-over is timed against it so the slab is never in transit while copy is on screen
    const copy = sec.querySelector<HTMLElement>('[data-shift-h2], [data-format-h2], [data-stats-grid]');
    const lead = copy ? copy.getBoundingClientRect().top - sec.getBoundingClientRect().top : 0;
    return { key: sec.dataset.chapter!, sec, anchor: a && getComputedStyle(a).display !== 'none' ? a : null, top: sp.getBoundingClientRect().top + window.scrollY, lead };
  });
}

function stateFor(c: Chapter): ChapterState {
  const p = placeOf(c.anchor);
  if (c.key === 'hero') {
    if (!p) return { ...BASE, slab: 0, field: 0.8 };
    return { ...BASE, ...p, ox: 1.25, oy: p.sy, pass: 0.22 };
  }
  if (c.key === 'shift') {
    const o = live.order;
    if (!p) return { ...BASE, slab: 0, field: 0.5, order: o };
    // one global reaction: as the Shift is read, the stream is ordered and decrypted,
    // the enclave clears a little and lets more clean output through
    const target = live.out ?? shiftH2;
    return { ...BASE, ...p, ...outOf(target, p), pass: lerp(0.12, 0.5, o), frost: lerp(0.24, 0.12, o), speed: lerp(1, 0.75, o), order: o };
  }
  if (c.key === 'stats') {
    if (!p) return { ...BASE, slab: 0, field: 0.4, order: 1 };
    // the clean beam lands on the stats grid's top rule
    let out = { ox: 1.2, oy: p.sy };
    if (statsGrid && window.innerWidth >= 1024) {
      const r = statsGrid.getBoundingClientRect();
      out = { ox: 1.2, oy: 1 - (r.top / window.innerHeight) * 2 };
    }
    return { ...BASE, ...p, ...out, pass: 0.5, frost: 0.18, speed: 0.75, order: 1 };
  }
  if (c.key === 'format') {
    const g = live.stage;
    if (!p) return { ...BASE, slab: 0, field: 0.4, order: 1, stage: g };
    // one stage: as Format is read, every lane converges on a single line through the
    // enclave and leaves it as one straight beam
    return { ...BASE, ...p, ox: 1.25, oy: p.sy, pass: lerp(0.5, 0.75, g), frost: lerp(0.18, 0.1, g), speed: lerp(0.75, 0.6, g), order: 1, stage: g };
  }
  // footer: the enclave stays on its Format anchor, the stream calms down
  const last = chapters.find((x) => x.key === 'format');
  const lp = placeOf(last?.anchor ?? null);
  if (!lp) return { ...BASE, slab: 0, field: 0.25, speed: 0.6, order: 1, stage: 1 };
  return { ...BASE, ...lp, ox: 1.25, oy: lp.sy, pass: 0.75, frost: 0.1, field: 0.7, speed: 0.6, order: 1, stage: 1 };
}

const tmp = { ...BASE };
function driveScene() {
  if (!scene || !chapters.length) return;
  const vh = window.innerHeight;
  const probe = window.scrollY + vh * 0.5;
  Object.assign(tmp, stateFor(chapters[0]));
  for (let i = 1; i < chapters.length; i++) {
    const c = chapters[i];
    // hand-over happens while the next section is still entering (its top between
    // 95% and 55% of the viewport) so the slab is re-formed at its new anchor early
    // probe = scrollY + vh/2, so the copy enters the viewport at probe = top + lead - vh/2
    const from = c.top + c.lead - vh * 0.58;
    const to = from + vh * 0.4;
    const s = stateFor(c);
    // a cross-screen move (hero → shift) never drags the slab across copy: it is fully
    // dissolved BEFORE the next section's copy enters (from ~0.42vh ahead of its top)
    // and only re-forms once it sits at its next anchor
    const isCross = Math.hypot(s.sx - tmp.sx, s.sy - tmp.sy) > 0.5;
    const pre = smooth(from - vh * 0.12, from, probe);
    if (probe < from) {
      if (isCross) {
        tmp.slab *= 1 - pre;
        tmp.field *= 1 - pre * 0.4;
      }
      break;
    }
    const t = smooth(from, to, probe);
    const cross = isCross ? 1 - smooth(0.93, 1, t) : 0;
    for (const k of KEYS) tmp[k] = lerp(tmp[k], s[k], t);
    tmp.slab *= 1 - cross;
    tmp.field *= 1 - cross * 0.6;
  }
  tmp.ss *= lerp(0.82, 1, live.intro);
  tmp.frost = lerp(1, tmp.frost, live.intro);
  Object.assign(scene.target, tmp);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();

  const canvas = $<HTMLCanvasElement>('[data-gl]');
  const lowTier = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  const hasGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  })();
  if (canvas && hasGL) {
    try {
      scene = createScene(canvas, { lowTier, isStatic: reduceMotion });
    } catch (err) {
      scene = null;
      console.info('[v3b-nearcon] WebGL unavailable, using CSS fallback.', err);
    }
  }
  root.classList.add(scene ? 'gl-on' : 'no-gl');
  if (scene) live.pulse = (v = 1) => scene?.pulse(v);
  if (reduceMotion && canvas) {
    canvas.style.position = 'absolute';
    canvas.style.height = '100vh';
  }

  initModalFx(getLenis, (p) => scene?.pause(p));
  if (finePointer) {
    window.addEventListener('pointermove', (e) => scene?.setPointer(e.clientX, e.clientY), { passive: true });
    document.documentElement.addEventListener('pointerleave', () => scene?.setPointer(-9999, -9999, false));
  }

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
  }

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      const target = hash.length > 1 ? $(hash) : null;
      if (!target) return;
      if (lenis) {
        e.preventDefault();
        lenis.scrollTo(hash === '#top' ? 0 : scrollTargetY(target), { duration: 1.4 });
        history.replaceState(null, '', hash);
      }
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  // header turns solid-ish once the hero has scrolled a little
  const hud = $('[data-hud]');
  const onScroll = () => hud?.classList.toggle('is-scrolled', window.scrollY > 24);
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let motionOk = true;
  if (!reduceMotion) {
    for (const fn of [initHero, initShift, initStats, initFormat, initReveals]) {
      try {
        fn();
      } catch (err) {
        console.info('[v3b-nearcon] section motion skipped:', err);
        if (fn === initReveals) {
          motionOk = false;
          root.classList.remove('vnc-motion');
        }
      }
    }
  }

  if (scene) {
    const sc = scene;
    ScrollTrigger.addEventListener('refresh', measure);
    measure();
    if (reduceMotion) {
      driveScene();
      sc.snap();
      sc.setLens(false);
      sc.render(0);
      window.addEventListener('resize', () => requestAnimationFrame(() => sc.render(0)));
    } else {
      gsap.ticker.add((_t, dms) => {
        driveScene();
        sc.tick(dms / 1000);
      });
      document.addEventListener('visibilitychange', () => sc.pause(document.hidden));
    }
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) sc.dispose();
    });
  }

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const ready = fontsReady.then(() => scene?.compile());
  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  if (reduceMotion || !motionOk) {
    unlock();
    start();
  } else {
    runIntro({
      ready,
      onReveal: () => {
        lenis?.start();
        start();
      },
      onHero: (tl, at) => heroReveal(tl, at),
    })
      .catch(() => root.classList.remove('vnc-motion'))
      .finally(() => {
        unlock();
        start();
      });
  }
  fontsReady.then(start);
  window.addEventListener('load', start, { once: true });
}

function unlock() {
  $('[data-loader]')?.remove();
  root.classList.remove('vnc-intro-long', 'vnc-intro-short', 'lenis-stopped');
  lenis?.start();
}

try {
  boot();
} catch (err) {
  root.classList.remove('vnc-motion');
  unlock();
  console.info('[v3b-nearcon] boot failed, static page shown.', err);
}
window.__vncready = true;
