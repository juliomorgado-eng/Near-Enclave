// NEAR Enclave 2027 — v4A-NEARCON "Plano" boot.
// Line art that draws itself: circles + drawings (stroke-dashoffset on pathLength=1),
// dashed diagonals that grow from the circle's centre, pointer parallax, a scroll-
// scrubbed lattice → vault redraw in the Shift, count-up figures with pixel bars.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, onReveal, checkPendingReveals } from '../v3/util';

declare global {
  interface Window {
    __plready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger);
const root = document.documentElement;
let lenis: Lenis | null = null;

/* ------------------------------------------------------------------ */
/* drawing helpers                                                     */
/* ------------------------------------------------------------------ */
type Ends = { x1: number; y1: number; x2: number; y2: number; px: number; py: number };
const ends = new WeakMap<SVGLineElement, Ends>();
function lineEnds(l: SVGLineElement): Ends {
  let e = ends.get(l);
  if (e) return e;
  const n = (k: string) => parseFloat(l.getAttribute(k) || '0');
  const x1 = n('x1'), y1 = n('y1'), x2 = n('x2'), y2 = n('y2');
  // grow from the point of the line nearest the circle centre (200,200)
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((200 - x1) * dx + (200 - y1) * dy) / (dx * dx + dy * dy)));
  e = { x1, y1, x2, y2, px: x1 + dx * t, py: y1 + dy * t };
  ends.set(l, e);
  return e;
}
function growLines(tl: gsap.core.Timeline, lines: SVGLineElement[], at: number | string, dur = 1.4) {
  lines.forEach((l, i) => {
    const e = lineEnds(l);
    tl.fromTo(
      l,
      { opacity: 1, attr: { x1: e.px, y1: e.py, x2: e.px, y2: e.py } },
      { attr: { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }, duration: dur, ease: 'power3.inOut' },
      typeof at === 'number' ? at + i * 0.08 : at,
    );
  });
}

/** full draw-in of one orb (rings → diagonals → drawing → fills → nodes) */
function drawOrb(svg: SVGSVGElement, tl: gsap.core.Timeline, at = 0, scale = 1) {
  const rings = $$<SVGElement>('.orb__ring', svg);
  const lines = $$<SVGLineElement>('[data-grow]', svg);
  const art = $$<SVGElement>('.orb__art [data-draw]', svg);
  const fades = $$<SVGElement>('.orb__art [data-fade]', svg);
  const faces = $$<SVGElement>('[data-face]', svg);
  const pops = $$<SVGElement>('.orb__art [data-pop]', svg);
  const rim = $$<SVGElement>('.orb__rim [data-pop]', svg);
  tl.to(rings, { strokeDashoffset: 0, duration: 1.3 * scale, ease: 'power2.inOut', stagger: 0.15 }, at);
  growLines(tl, lines, at + 0.25 * scale, 1.5 * scale);
  tl.to(art, { strokeDashoffset: 0, duration: 0.9 * scale, ease: 'power2.inOut', stagger: { amount: 0.9 * scale } }, at + 0.4 * scale);
  tl.to(fades, { opacity: 1, duration: 0.6, stagger: 0.05 }, at + 1.1 * scale);
  tl.to(faces, { opacity: 1, duration: 0.8, ease: 'power1.out', stagger: 0.08 }, at + 1.2 * scale);
  tl.fromTo(pops, { opacity: 0, scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: { amount: 0.4 } }, at + 1.0 * scale);
  tl.fromTo(rim, { opacity: 0, scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.4)', stagger: 0.07 }, at + 1.1 * scale);
}

function drawEllipses(svg: SVGSVGElement | null, tl: gsap.core.Timeline, at = 0, dur = 1) {
  if (!svg) return;
  tl.to($$('[data-draw]', svg), { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut', stagger: dur * 0.08 }, at);
}

/* ------------------------------------------------------------------ */
/* hero                                                                */
/* ------------------------------------------------------------------ */
function heroIntro(tl: gsap.core.Timeline, at: number) {
  const hero = $('[data-hero]');
  if (!hero) return;
  const orbs = $$<SVGSVGElement>('.hero__orb .orb', hero);
  tl.to('.hud', { opacity: 1, duration: 0.6 }, at);
  tl.to(['.fr--t', '.fr--b'], { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }, at);
  tl.to(['.fr--l', '.fr--r'], { scaleY: 1, duration: 1.1, ease: 'power3.inOut' }, at + 0.1);
  tl.to('.fd', { opacity: 1, duration: 0.3, stagger: 0.06 }, at + 0.8);
  orbs.forEach((o, i) => drawOrb(o, tl, at + 0.1 + i * 0.25));
  tl.to('[data-hl]', { y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, at + 0.3);
  tl.to('[data-hin]', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, at + 0.55);
}

function initParallax() {
  const hero = $('[data-hero]');
  if (!hero || !finePointer || reduceMotion) return;
  const items = $$('[data-par]', hero).map((el) => {
    const k = parseFloat(el.dataset.par || '0');
    return {
      k,
      x: gsap.quickTo(el, 'x', { duration: 1.1, ease: 'power3.out' }),
      y: gsap.quickTo(el, 'y', { duration: 1.1, ease: 'power3.out' }),
    };
  });
  let on = true;
  ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', onToggle: (s) => (on = s.isActive) });
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!on) return;
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      for (const it of items) {
        it.x(nx * 26 * it.k);
        it.y(ny * 18 * it.k);
      }
    },
    { passive: true },
  );
  // the composition drifts apart a little as the hero scrolls away
  gsap.to('.hero__orb--l', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__orb--r', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
}

/* ------------------------------------------------------------------ */
/* shift: the open lattice is redrawn as the sealed vault              */
/* ------------------------------------------------------------------ */
function initShift() {
  const wrap = $('[data-morph]');
  const grid = $('.shift__grid');
  const svg = wrap?.querySelector<SVGSVGElement>('svg');
  if (!wrap || !grid || !svg) return;
  const rings = $$<SVGElement>('.orb__ring', svg);
  const lines = $$<SVGLineElement>('[data-grow]', svg);
  const rim = $$<SVGElement>('.orb__rim [data-pop]', svg);
  const lat = $('[data-lat]', svg)!;
  const vlt = $('[data-vault]', svg)!;
  const latDraw = $$<SVGElement>('[data-draw]', lat);
  const latFade = $$<SVGElement>('[data-fade]', lat);
  const latPop = $$<SVGElement>('[data-pop]', lat);
  const vDraw = $$<SVGElement>('[data-draw]', vlt);
  const vFade = $$<SVGElement>('[data-fade]', vlt);
  const vFace = $$<SVGElement>('[data-face]', vlt);
  const vPop = $$<SVGElement>('[data-pop]', vlt);
  gsap.set([...latPop, ...vPop, ...rim], { transformOrigin: '50% 50%', transformBox: 'fill-box' });

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: grid,
      start: 'top 78%',
      end: () => (window.innerWidth >= 1024 ? 'bottom bottom' : 'bottom 45%'),
      scrub: 0.8,
      invalidateOnRefresh: true,
    },
  });
  // 0 → 0.3 : the circle and the open lattice are drawn
  tl.to(rings, { strokeDashoffset: 0, duration: 0.16, stagger: 0.03 }, 0);
  growLines(tl, lines, 0.04, 0.2);
  tl.fromTo(rim, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.05, stagger: 0.015 }, 0.14);
  tl.to(latDraw, { strokeDashoffset: 0, duration: 0.12, stagger: { amount: 0.14 } }, 0.06);
  tl.to(latFade, { opacity: 1, duration: 0.06 }, 0.22);
  tl.fromTo(latPop, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.05, stagger: { amount: 0.08 } }, 0.2);
  // hold, then 0.42 → 0.72 : the lattice retracts while the vault is traced over it
  tl.to(latPop, { opacity: 0, scale: 0, duration: 0.05, stagger: { amount: 0.06 } }, 0.42);
  tl.to(latFade, { opacity: 0, duration: 0.05 }, 0.42);
  tl.to(latDraw, { strokeDashoffset: -1, duration: 0.12, stagger: { amount: 0.14 } }, 0.44);
  tl.to(vDraw, { strokeDashoffset: 0, duration: 0.14, stagger: { amount: 0.16 } }, 0.5);
  tl.to(vFade, { opacity: 1, duration: 0.06 }, 0.66);
  tl.to(vFace, { opacity: 1, duration: 0.1, stagger: 0.03 }, 0.72);
  tl.fromTo(vPop, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.05, stagger: 0.012 }, 0.78);
  // sealed: the diagonals settle in
  tl.to(lines, { opacity: 0.55, duration: 0.1 }, 0.86);
  tl.to({}, { duration: 0.1 }, 0.9);
}

/* ------------------------------------------------------------------ */
/* stats: count-up + pixel bars                                        */
/* ------------------------------------------------------------------ */
function initStats() {
  $$('[data-stat]').forEach((st, i) => {
    const val = st.querySelector<HTMLElement>('[data-val]')!;
    const cells = $$('.px__c', st);
    const brs = $$('.br', st);
    const final = val.textContent || '';
    const n = parseFloat(st.dataset.n || '0');
    const n2 = st.dataset.n2 ? parseFloat(st.dataset.n2) : null;
    const dec = parseInt(st.dataset.dec || '0', 10);
    const m = final.match(/^([^0-9]*)[0-9.]+(?:–[0-9.]+)?(.*)$/);
    const pre = m?.[1] ?? '';
    const suf = m?.[2] ?? '';
    const fmt = (v: number) => v.toFixed(dec);
    val.textContent = `${pre}${fmt(0)}${n2 !== null ? '–' + fmt(0) : ''}${suf}`;
    onReveal(st, () => {
      const tl = gsap.timeline({ delay: i * 0.12 });
      tl.fromTo(brs, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out', stagger: 0.05 }, 0);
      const o = { p: 0 };
      tl.to(
        o,
        {
          p: 1,
          duration: 1.7,
          ease: 'power3.out',
          onUpdate: () => {
            const a = n * o.p;
            val.textContent = `${pre}${fmt(a)}${n2 !== null ? '–' + fmt(n2 * o.p) : ''}${suf}`;
            const on = Math.round(o.p * cells.length);
            cells.forEach((c, k) => c.classList.toggle('is-on', k < on));
          },
          onComplete: () => {
            val.textContent = final;
            cells.forEach((c) => c.classList.add('is-on'));
          },
        },
        0.15,
      );
    }, 'top 85%');
  });
}

/* ------------------------------------------------------------------ */
/* rest of the page reveals                                            */
/* ------------------------------------------------------------------ */
function initReveals() {
  $$('[data-rise]').forEach((el) =>
    onReveal(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out' }), 'top 86%'),
  );
  const sky = $<SVGSVGElement>('[data-sky] svg');
  if (sky) onReveal(sky, () => drawOrb(sky, gsap.timeline(), 0, 1.1), 'top 80%');
  $$<SVGSVGElement>('.stats__ell, .foot__ell').forEach((e) => onReveal(e, () => drawEllipses(e, gsap.timeline(), 0, 1.4), 'top 92%'));
}

/* digit rivers crawl only while on screen and while the modal is closed */
function initRivers() {
  const rvs = $$('[data-rivers]');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-off', !e.isIntersecting)), { rootMargin: '80px 0px' });
  rvs.forEach((r) => io.observe(r));
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
function unlock() {
  $('[data-loader]')?.remove();
  lenis?.start();
}

function boot() {
  initRequestModal();
  initRivers();
  window.addEventListener('request:open', () => {
    root.classList.add('pl-modal');
    lenis?.stop();
  });
  window.addEventListener('request:close', () => {
    root.classList.remove('pl-modal');
    lenis?.start();
  });

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
  }

  $$<HTMLAnchorElement>('a[href="#top"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (!lenis) return;
      e.preventDefault();
      lenis.scrollTo(0, { duration: 1.2 });
    }),
  );

  const hud = $('[data-hud]');
  const onScroll = () => hud?.classList.toggle('is-scrolled', window.scrollY > 24);
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (reduceMotion || !root.classList.contains('pl-motion')) {
    unlock();
    return;
  }

  for (const fn of [initParallax, initShift, initStats, initReveals]) {
    try {
      fn();
    } catch (err) {
      console.info('[v4a-nearcon] section motion skipped:', err);
    }
  }

  // loader: the ellipse mark traces itself, then lifts (≈1s)
  const tl = gsap.timeline();
  const ld = $('[data-loader]');
  if (ld) {
    drawEllipses(ld.querySelector('svg'), tl, 0, 0.7);
    tl.to(ld, { opacity: 0, duration: 0.3, ease: 'power1.in', onComplete: unlock }, 0.85);
  }
  heroIntro(tl, ld ? 0.95 : 0);
  tl.eventCallback('onComplete', unlock);

  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  (document.fonts?.ready ?? Promise.resolve()).then(start);
  window.addEventListener('load', start, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('pl-motion');
  unlock();
  console.info('[v4a-nearcon] boot failed, static page shown.', err);
}
window.__plready = true;
