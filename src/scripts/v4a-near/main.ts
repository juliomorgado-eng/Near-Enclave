// NEAR Enclave 2027 — v4A-NEAR "Plano": a technical line drawing that draws itself.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, onReveal, checkPendingReveals, lerp, smooth } from '../v3/util';
import { SHIFT, pathOf, type Pt } from './geo';
import { createWire, type Wire } from './wire';

declare global {
  interface Window {
    __v4anready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
let lenis: Lenis | null = null;
let wire: Wire | null = null;

/* ------------------------------------------------------------------ */
/* Hero intro: grid → headline → diagram draws in                       */
/* ------------------------------------------------------------------ */
function intro() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  const cols = $$('.gridlines__c').filter((c) => getComputedStyle(c).display !== 'none');
  tl.to(cols, { scaleY: 1, duration: 0.7, stagger: 0.03, ease: 'power2.inOut' }, 0);
  tl.to('.hero__l', { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.9, stagger: 0.09, ease: 'expo.out' }, 0.15);
  tl.to('[data-hero-in]', { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0.3);
  tl.to('[data-hatch]', { clipPath: 'inset(0 0% 0 0)', duration: 0.8, ease: 'power2.inOut' }, 0.6);
  // diagram
  tl.to('.dia__thin .dw', { strokeDashoffset: 0, duration: 1.1, stagger: 0.08, ease: 'power2.inOut' }, 0.2);
  tl.to('.dia__thin .dw--dash', { opacity: 1, duration: 0.6 }, 0.5);
  tl.to('.dia__net .dw', { strokeDashoffset: 0, duration: 0.9, stagger: 0.12, ease: 'power2.inOut' }, 0.55);
  tl.set('.dia__nodes', { opacity: 1 }, 0.8);
  tl.from('.dia__nodes .nd', { opacity: 0, duration: 0.25, stagger: 0.04, ease: 'none' }, 0.8);
  tl.to('.dia__tag .dw', { strokeDashoffset: 0, duration: 0.4 }, 1.25);
  tl.to(['.dia__tag .nd', '.tag'], { opacity: 1, duration: 0.3, stagger: 0.1, ease: 'none' }, 1.3);
  tl.from('[data-wire]', { opacity: 0, duration: 0.8 }, 0.6);
  return tl;
}

/* ------------------------------------------------------------------ */
/* Shift: open network re-routes and closes into the enclave            */
/* ------------------------------------------------------------------ */
function initShift() {
  const paths = $$<SVGPathElement>('[data-edge]');
  const nodes = $('[data-nodes]');
  const ghost = $('[data-ghost]');
  const fill = $('[data-fill]');
  const core = $('[data-core]');
  const coreSq = $('[data-core-sq]');
  const sentences = $$('[data-sn]');
  const at = [0, 0.18, 0.5, 0.8];
  const tmp: Pt[] = [[0, 0], [0, 0], [0, 0]];

  const set = (T: number) => {
    const route = smooth(0.02, 0.32, T);
    const thick = smooth(0.66, 0.86, T);
    const w = lerp(1.2, 10, thick);
    SHIFT.edges.forEach((e, i) => {
      const c = smooth(0.28 + e.delay, 0.62 + e.delay, T);
      for (let k = 0; k < 3; k++) {
        const ox = lerp(e.open[k][0], e.routed[k][0], route);
        const oy = lerp(e.open[k][1], e.routed[k][1], route);
        tmp[k][0] = lerp(ox, e.closed[k][0], c);
        tmp[k][1] = lerp(oy, e.closed[k][1], c);
      }
      const p = paths[i];
      if (!p) return;
      p.setAttribute('d', pathOf(tmp));
      p.style.strokeWidth = String(w);
    });
    if (nodes) nodes.style.opacity = String(1 - smooth(0.25, 0.55, T));
    if (ghost) ghost.style.opacity = String(1 - smooth(0.05, 0.45, T));
    if (fill) fill.style.transform = `scale(${smooth(0.84, 0.97, T)})`;
    if (core) core.style.opacity = String(1 - smooth(0.86, 0.93, T));
    if (coreSq) coreSq.style.opacity = String(smooth(0.9, 0.98, T));
    sentences.forEach((s, i) => s.classList.toggle('is-on', T >= at[i]));
    sentences[2]?.classList.toggle('is-sealed', T >= 0.9);
  };

  if (reduceMotion) {
    set(1);
    return;
  }
  set(0);
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    ScrollTrigger.create({
      trigger: '[data-shift]',
      start: 'top top',
      end: '+=170%',
      pin: true,
      scrub: true,
      onUpdate: (st) => set(st.progress),
    });
  });
  mm.add('(max-width: 1023.98px)', () => {
    ScrollTrigger.create({
      trigger: '.shift__fig',
      start: 'top 80%',
      end: 'bottom 55%',
      scrub: true,
      onUpdate: (st) => set(st.progress),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Stats: count up + tick-timeline active stretch                       */
/* ------------------------------------------------------------------ */
function initStats() {
  $$('[data-st]').forEach((st) => {
    const v = st.querySelector<HTMLElement>('[data-count]');
    if (v) {
      const n = parseFloat(v.dataset.n || '0');
      const n2 = v.dataset.n2 ? parseFloat(v.dataset.n2) : null;
      const d = parseInt(v.dataset.d || '0', 10);
      const pre = v.dataset.pre || '';
      const suf = v.dataset.suf || '';
      const final = v.textContent || '';
      const o = { t: 0 };
      const render = () => {
        const a = (n * o.t).toFixed(d);
        v.textContent = n2 != null ? `${pre}${Math.round(n * o.t)}–${Math.round(n2 * o.t)}${suf}` : `${pre}${a}${suf}`;
      };
      render();
      onReveal(v, () => {
        gsap.to(o, { t: 1, duration: 1.4, ease: 'expo.out', onUpdate: render, onComplete: () => (v.textContent = final) });
      }, 'top 85%');
    }
    const on = st.querySelector<HTMLElement>('[data-st-on]');
    if (on) {
      gsap.fromTo(on, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: st, start: 'top 90%', end: 'top 40%', scrub: true } });
    }
  });
  const stripe = $('[data-stripe]');
  if (stripe) {
    gsap.fromTo(stripe, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '[data-stats]', start: 'top 80%', end: 'bottom 70%', scrub: true } });
  }
}

/* ------------------------------------------------------------------ */
/* Format: Manhattan draws on scroll                                    */
/* ------------------------------------------------------------------ */
function initFormat() {
  const tl = gsap.timeline({
    scrollTrigger: { trigger: '[data-sky]', start: 'top 85%', end: 'bottom 98%', scrub: 0.6 },
    defaults: { ease: 'none' },
  });
  tl.fromTo('[data-water]', { opacity: 1, scaleY: 0, transformOrigin: '50% 0%' }, { scaleY: 1, duration: 0.15 }, 0);
  tl.to('[data-row]', { opacity: 1, duration: 0.05, stagger: 0.03 }, 0.08);
  tl.to('[data-sky-o]', { strokeDashoffset: 0, duration: 0.35, stagger: 0.012 }, 0.05);
  tl.to('[data-sky-d]', { strokeDashoffset: 0, duration: 0.3, stagger: 0.01 }, 0.4);
  $$('[data-rise]').forEach((el, i) =>
    onReveal(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 0.9, delay: i * 0.08, ease: 'power3.out' }), 'top 85%'),
  );
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();

  const canvas = $<HTMLCanvasElement>('[data-wire]');
  if (canvas) {
    try {
      wire = createWire(canvas, { isStatic: reduceMotion });
    } catch (err) {
      wire = null;
      canvas.remove();
      console.info('[v4a-near] WebGL unavailable, diagram only.', err);
    }
  }
  if (finePointer && wire) {
    window.addEventListener('pointermove', (e) => wire?.setPointer(e.clientX, e.clientY), { passive: true });
  }

  window.addEventListener('request:open', () => {
    lenis?.stop();
    wire?.pause(true);
  });
  window.addEventListener('request:close', () => {
    lenis?.start();
    wire?.pause(false);
  });

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  $$<HTMLAnchorElement>('a[href="#top"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (!lenis) return;
      e.preventDefault();
      lenis.scrollTo(0, { duration: 1.2 });
    }),
  );

  // decorative scroll progress: tick timeline under the header
  const bar = $('[data-progress]');
  if (bar) {
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (st) => gsap.set(bar, { scaleX: st.progress }),
      onRefresh: (st) => gsap.set(bar, { scaleX: st.progress }),
    });
  }

  initShift();
  if (!reduceMotion) {
    for (const fn of [initStats, initFormat]) {
      try {
        fn();
      } catch (err) {
        console.info('[v4a-near] section motion skipped:', err);
      }
    }
    try {
      intro();
    } catch (err) {
      root.classList.remove('v4an-motion');
      console.info('[v4a-near] intro skipped:', err);
    }
  }

  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  document.fonts?.ready.then(start);
  window.addEventListener('load', start, { once: true });
  window.addEventListener('pagehide', (e) => {
    if (!e.persisted) wire?.dispose();
  });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v4an-motion');
  console.info('[v4a-near] boot failed, static page shown.', err);
}
window.__v4anready = true;
