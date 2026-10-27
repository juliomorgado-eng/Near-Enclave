// NEAR Enclave 2027 — v3B "TEE" boot.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, checkPendingReveals, smooth, lerp, finePointer, scrollTargetY } from '../v3/util';
import { createScene, KEYS, type ChapterState, type Scene } from './scene';
import { runIntro } from './intro';
import { initMenu, initModalFx } from './ui';
import { live, initReveals, heroReveal, initHero, initShift, initStats, statRows } from './sections';

declare global {
  interface Window {
    __v3bready?: boolean;
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
const BASE: ChapterState = { field: 1, slab: 1, sx: 0.45, sy: 0, ss: 0.5, frost: 0.26, ox: 1.2, oy: 0, pass: 0.2, speed: 1, mark: 1 };
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
let statsList: HTMLElement | null = null;
type Chapter = { key: string; sec: HTMLElement; anchor: HTMLElement | null; top: number };
let chapters: Chapter[] = [];
function measure() {
  shiftH2 = $('[data-shift-h2]');
  statsList = $('.stats__list');
  chapters = $$('[data-chapter]').map((sec) => {
    const a = sec.querySelector<HTMLElement>('[data-slab-anchor]');
    const sp = sec.parentElement?.classList.contains('pin-spacer') ? sec.parentElement : sec;
    return { key: sec.dataset.chapter!, sec, anchor: a && getComputedStyle(a).display !== 'none' ? a : null, top: sp.getBoundingClientRect().top + window.scrollY };
  });
}

function nearestStat(): HTMLElement | null {
  const H = window.innerHeight;
  let best: HTMLElement | null = null;
  let bd = Infinity;
  for (const row of statRows) {
    if (!row.classList.contains('is-out')) continue;
    const v = row.querySelector<HTMLElement>('[data-stat-val]')!;
    const r = v.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H) continue;
    const d = Math.abs(r.top + r.height / 2 - H * 0.5);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

function stateFor(c: Chapter): ChapterState {
  const p = placeOf(c.anchor);
  if (c.key === 'hero') {
    if (!p) return { ...BASE, slab: 0, field: 0.8 };
    return { ...BASE, ...p, ox: 1.25, oy: p.sy, pass: 0.22 };
  }
  if (c.key === 'shift') {
    if (!p) return { ...BASE, slab: 0, field: 0.5 };
    // before the first sentence is out, the beam stops at the headline column
    return { ...BASE, ...p, ...outOf(live.out ?? shiftH2, p), pass: live.out ? 0.16 : 0.08, frost: 0.32 };
  }
  if (c.key === 'stats') {
    if (!p) return { ...BASE, slab: 0, field: 0.4 };
    const n = nearestStat();
    return { ...BASE, ...p, ...outOf(n ?? statsList, p), ...(n ? {} : { oy: p.sy }), pass: n ? 0.16 : 0.08, frost: 0.32 };
  }
  // footer: enclave closes, the stream thins out
  const last = chapters.find((x) => x.key === 'stats');
  const lp = placeOf(last?.anchor ?? null);
  return { ...BASE, ...(lp ?? {}), slab: 0, field: 0.25, speed: 0.6 };
}

const tmp = { ...BASE };
function driveScene() {
  if (!scene || !chapters.length) return;
  const vh = window.innerHeight;
  const probe = window.scrollY + vh * 0.5;
  Object.assign(tmp, stateFor(chapters[0]));
  for (let i = 1; i < chapters.length; i++) {
    const c = chapters[i];
    const from = c.top - vh * 0.2;
    const to = c.top + vh * 0.25;
    if (probe < from) break;
    const t = smooth(from, to, probe);
    const s = stateFor(c);
    // a cross-screen move (hero → shift) never drags the slab across copy:
    // it dissolves mid-flight and re-forms at its next anchor
    const cross = Math.abs(s.sx - tmp.sx) > 0.5 ? smooth(0, 0.12, t) * (1 - smooth(0.93, 1, t)) : 0;
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
  initMenu(getLenis);

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
      console.info('[v3b] WebGL unavailable, using CSS fallback.', err);
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
    if (a.hasAttribute('data-menu-link')) return;
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
    for (const fn of [initHero, initShift, initStats, initReveals]) {
      try {
        fn();
      } catch (err) {
        console.info('[v3b] section motion skipped:', err);
        if (fn === initReveals) {
          motionOk = false;
          root.classList.remove('v3b-motion');
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
      .catch(() => root.classList.remove('v3b-motion'))
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
  root.classList.remove('v3b-intro-long', 'v3b-intro-short', 'lenis-stopped');
  lenis?.start();
}

try {
  boot();
} catch (err) {
  root.classList.remove('v3b-motion');
  unlock();
  console.info('[v3b] boot failed, static page shown.', err);
}
window.__v3bready = true;
