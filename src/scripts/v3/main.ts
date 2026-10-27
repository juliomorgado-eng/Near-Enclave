// NEAR Enclave 2027 — v3 boot.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, checkPendingReveals, smooth, lerp, finePointer, scrollTargetY } from './util';
import { createScene, KEYS, type ChapterState, type Scene } from './scene';
import { runIntro } from './intro';
import { initClock, initGrain, initMenu, initCursor, initFaq, initModalFx, setHudLabel } from './ui';
import {
  live,
  initReveals,
  initThemes,
  heroReveal,
  initHero,
  initShift,
  initStats,
  initPlanes,
  initAgenda,
  initAudience,
  initPartners,
  initSpeakers,
  initClosing,
} from './sections';

declare global {
  interface Window {
    __v3ready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
CustomEase.create('seal', 'M0,0 C0.62,0 0.08,1 1,1');

const root = document.documentElement;
let lenis: Lenis | null = null;
let scene: Scene | null = null;
const getLenis = () => lenis;

/* ------------------------------------------------------------------ */
/* Chapter states for the WebGL scene                                  */
/* ------------------------------------------------------------------ */
const BASE: ChapterState = {
  stream: 1, converge: 0, grid: 0, ring: 0, field: 1, frost: 0.65, slab: 1, sx: 0.5, sy: 0.3, ss: 0.42,
  split: 0, light: 0, speed: 1, tilt: 0, flash: 0, mark: 1,
};
const S = (o: Partial<ChapterState>): ChapterState => ({ ...BASE, ...o });
// Slab placement per chapter comes from invisible [data-slab-anchor] boxes (CSS-positioned
// per breakpoint, always clear of body copy). sx/sy: NDC centre, ss: height / viewport height.
type Place = { sx: number; sy: number; ss: number };
const anchors: Record<string, Place | null> = {};
const place = (k: string, fb: Place): Place => anchors[k] ?? fb;
const HERO_FB: Place = { sx: 0.5, sy: 0.3, ss: 0.42 };
const CHAPTERS: Record<string, () => ChapterState> = {
  // on narrow screens the hero slab sits behind the title, so keep it faint there
  hero: () => S({ ...place('hero', HERO_FB), ...(window.innerWidth < 768 ? { slab: 0.22 } : {}) }),
  shift: () => {
    const p = live.shiftP;
    const c = smooth(0.0, 0.45, p);
    const a = place('hero', HERO_FB);
    const b = anchors.shift;
    const m = smooth(0, 0.3, p);
    // without a pinned layout (mobile) the slab fades back behind the copy
    if (!b) return S({ ...a, stream: 1 - c, converge: c, slab: 0.15 });
    return S({
      stream: 1 - c,
      converge: c,
      sx: lerp(a.sx, b.sx, m),
      sy: lerp(a.sy, b.sy, m),
      ss: lerp(a.ss, b.ss, m),
      frost: 0.65 + 0.35 * smooth(0.5, 0.6, p),
      flash: Math.exp(-Math.pow((p - 0.58) / 0.035, 2)),
    });
  },
  stats: () => S({ field: 0.3, slab: 0, frost: 1, mark: 0, ...(anchors.shift ?? place('hero', HERO_FB)) }),
  format: () => S({ stream: 0, grid: 1, slab: 0, sx: 0, tilt: 0.14 }),
  agenda: () => S({ stream: 0, grid: 1, field: 0, slab: 0, sx: 0 }),
  // slow, faint lanes here: the ring drew across the heading and list
  audience: () => S({ field: 0.22, slab: 0, speed: 0.3, mark: 0, sx: 0 }),
  partners: () => S({ field: 0.4, slab: 0, speed: 0.35, sx: 0 }),
  speakers: () => S({ field: 0.4, slab: 0, speed: 0.35, sx: 0 }),
  closing: () => {
    const p = live.closeP;
    return S({
      stream: 0,
      ring: 1,
      field: 0.55,
      slab: 1,
      mark: 0,
      ...place('closing', { sx: 0, sy: 0, ss: 0.6 }),
      frost: 0.85,
      split: smooth(0.12, 0.8, p),
      light: smooth(0.15, 0.5, p) * 0.8,
    });
  },
  faq: () => S({ field: 0, slab: 0, ring: 1, stream: 0, sx: 0 }),
  footer: () => S({ field: 0, slab: 0, ring: 1, stream: 0, sx: 0 }),
};

let marks: Array<{ top: number; key: string }> = [];
function measureChapters() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  $$('[data-chapter]').forEach((sec) => {
    const a = sec.querySelector<HTMLElement>('[data-slab-anchor]');
    const key = sec.dataset.chapter!;
    if (!a) return;
    const r = a.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(a).display === 'none') {
      anchors[key] = null;
      return;
    }
    // position relative to the section's top, i.e. where it sits when the section is at the top
    const top = sec.getBoundingClientRect().top;
    const cx = r.left + r.width / 2;
    const cy = r.top - top + r.height / 2;
    const ss = Math.min(r.height / H, ((r.width / W) * (W / H) * 3) / 2.2);
    anchors[key] = { sx: (cx / W) * 2 - 1, sy: 1 - (cy / H) * 2, ss };
  });
  marks = $$('[data-chapter]').map((el) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    key: el.dataset.chapter!,
  }));
}

const tmpState = { ...BASE };
function driveScene() {
  if (!scene || !marks.length) return;
  const vh = window.innerHeight;
  const probe = window.scrollY + vh * 0.5;
  Object.assign(tmpState, CHAPTERS[marks[0].key]());
  for (let i = 1; i < marks.length; i++) {
    const m = marks[i];
    // FAQ follows the open vault: clear the slab/ring before its list enters the frame
    const [from, to] = m.key === 'faq' ? [0.55, 0.15] : [0.12, -0.28];
    if (probe < m.top - vh * from) break;
    const t = smooth(m.top - vh * from, m.top - vh * to, probe);
    const s = CHAPTERS[m.key]?.();
    if (!s) continue;
    for (const k of KEYS) tmpState[k] = lerp(tmpState[k], s[k], t);
  }
  // intro: slab scales 0.85 → 1, frost 1 → resting
  const ii = live.intro;
  tmpState.ss *= lerp(0.85, 1, ii);
  tmpState.frost = lerp(1, tmpState.frost, ii);
  Object.assign(scene.target, tmpState);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();
  initClock();
  initGrain();
  initFaq();
  initMenu(getLenis);

  // WebGL
  const canvas = $<HTMLCanvasElement>('[data-gl]');
  const lowTier =
    (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  if (canvas) {
    try {
      scene = createScene(canvas, { lowTier, isStatic: reduceMotion });
    } catch (err) {
      scene = null;
      console.info('[v3] WebGL unavailable, using CSS fallback.', err);
    }
  }
  if (scene) root.classList.add('gl-on');
  else root.classList.add('no-gl');
  if (reduceMotion && canvas) {
    // single static hero frame, scrolls away with the hero
    canvas.style.position = 'absolute';
    canvas.style.height = '100vh';
  }

  initModalFx(getLenis, (p) => scene?.pause(p));
  initCursor((x, y) => scene?.setPointer(x, y));

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
  }

  // anchors through Lenis
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

  // HUD progress
  const bar = $('[data-progress]');
  const pct = $('[data-hud-pct]');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (bar) bar.style.transform = `scaleX(${p})`;
    if (pct) pct.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
  };
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Sections — pinned sections first (in DOM order) so later triggers include pin spacing
  let motionOk = true;
  if (!reduceMotion) {
    // each section is isolated: one failure never disables the rest or locks scrolling
    const inits: Array<() => void> = [
      initHero,
      initShift,
      initStats,
      () => initPlanes(scene),
      () => initAgenda(getLenis),
      initAudience,
      () => initPartners(getLenis),
      initSpeakers,
      initClosing,
      initReveals,
    ];
    for (const fn of inits) {
      try {
        fn();
      } catch (err) {
        console.info('[v3] section motion skipped:', err);
        if (fn === initReveals) {
          motionOk = false;
          root.classList.remove('v3-motion');
        }
      }
    }
  }
  if (!motionOk) unlock();

  const syncTheme = initThemes(setHudLabel);
  gsap.ticker.add(syncTheme);

  // Render loop (one ticker for Lenis, GSAP and WebGL)
  if (scene) {
    const sc = scene;
    ScrollTrigger.addEventListener('refresh', measureChapters);
    measureChapters();
    if (reduceMotion) {
      driveScene();
      sc.snap();
      sc.setLens(false);
      sc.render(0);
      window.addEventListener('resize', () => requestAnimationFrame(() => sc.render(0)));
    } else {
      gsap.ticker.add((_t, dms) => {
        driveScene();
        sc.setTheme(document.body.dataset.theme === 'cream' ? 1 : 0);
        sc.setVelocity(Math.max(-1, Math.min(1, (lenis?.velocity ?? 0) / 40)));
        sc.tick(dms / 1000);
      });
      const vis = () => sc.pause(document.hidden);
      document.addEventListener('visibilitychange', vis);
    }
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) sc.dispose();
    });
  }

  // Intro
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  let loadP = 0.2;
  const ready = fontsReady.then(() => {
    loadP = 0.7;
    scene?.compile();
    loadP = 1;
  });
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
      progress: () => loadP,
      onSplit: () => {
        lenis?.start();
        start();
      },
      onHero: (tl, at) => heroReveal(tl, at),
    })
      .catch(() => {
        root.classList.remove('v3-motion');
      })
      .finally(() => {
        unlock();
        start();
      });
  }

  fontsReady.then(() => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  });
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  }, { once: true });
}

function unlock() {
  $('[data-loader]')?.remove();
  root.classList.remove('v3-intro-long', 'v3-intro-short', 'lenis-stopped');
  lenis?.start();
}

try {
  boot();
} catch (err) {
  root.classList.remove('v3-motion');
  unlock();
  console.info('[v3] boot failed, static page shown.', err);
}
window.__v3ready = true;
