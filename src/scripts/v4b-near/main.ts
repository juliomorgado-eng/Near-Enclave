// NEAR Enclave 2027 — v4B-NEAR "Módulo" boot (dark warm, halftone module grid).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { createField, type Field } from './field';
import { createShift } from './shift';
import { createNyc } from './nyc';

declare global {
  interface Window {
    __v4bnready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => c.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => [...c.querySelectorAll<T>(s)];
let lenis: Lenis | null = null;
let field: Field | null = null;

function fmt(n: number, d: number) {
  return n.toFixed(d);
}

/* ---------------- hero ---------------- */
function initHero() {
  const cv = $<HTMLCanvasElement>('[data-hero-field]');
  if (cv) {
    try {
      field = createField(cv, { reduce, fine });
    } catch (err) {
      console.info('[v4b-near] field skipped', err);
    }
  }
  if (!field) return;
  if (reduce) {
    field.renderStatic();
    window.addEventListener('resize', () => field?.renderStatic());
  } else {
    field.start();
    window.addEventListener('resize', () => field?.resize());
  }
}

function heroIntro() {
  if (reduce) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.to('[data-hero-line]', { yPercent: 0, y: 0, duration: 1.1, stagger: 0.08 }, 0.15)
    .to('[data-hero-in]', { opacity: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.45);
}

/* ---------------- shift ---------------- */
function initShift() {
  const cv = $<HTMLCanvasElement>('[data-shift-cv]');
  const sec = $('[data-shift]');
  if (!cv || !sec) return;
  const sh = createShift(cv);
  if (!sh) return;
  if (reduce) {
    sh.set(1);
    window.addEventListener('resize', () => sh.draw());
    return;
  }
  sh.set(0.0001);
  sh.set(0);
  const mm = gsap.matchMedia();
  mm.add('(min-width: 768px) and (min-height: 600px)', () => {
    ScrollTrigger.create({
      trigger: sec,
      pin: '[data-shift-pin]',
      start: 'top top',
      end: '+=170%',
      scrub: 0.6,
      onUpdate: (st) => sh.set(st.progress),
      onRefresh: (st) => {
        sh.draw();
        sh.set(st.progress);
      },
    });
  });
  mm.add('not all and (min-width: 768px) and (min-height: 600px)', () => {
    ScrollTrigger.create({
      trigger: '[data-shift-cv]',
      start: 'top 85%',
      end: 'center 55%',
      scrub: 0.6,
      onUpdate: (st) => sh.set(st.progress),
      onRefresh: (st) => {
        sh.draw();
        sh.set(st.progress);
      },
    });
  });
}

/* ---------------- stats ---------------- */
function paintStrip(svg: SVGSVGElement, p: number) {
  const cols = 56;
  const n = p * cols;
  for (const r of svg.querySelectorAll<SVGRectElement>('rect')) {
    const c = +(r.dataset.c || 0);
    r.classList.toggle('on', c < n);
    r.classList.toggle('lead', c < n && c >= n - 1.5 && p < 1);
  }
}

function initStats() {
  for (const el of $$('[data-stat]')) {
    const val = $('[data-stat-val]', el)!;
    const strip = $<SVGSVGElement>('[data-strip]', el)!;
    const n = +el.dataset.n!;
    const n2 = el.dataset.n2 ? +el.dataset.n2 : null;
    const d = +el.dataset.d!;
    const pre = el.dataset.pre || '';
    const suf = el.dataset.suf || '';
    const render = (k: number) => {
      val.textContent = pre + fmt(n * k, d) + (n2 !== null ? '–' + fmt(n2 * k, d) : '') + suf;
    };
    if (reduce) {
      paintStrip(strip, 1);
      continue;
    }
    render(0);
    paintStrip(strip, 0);
    const o = { k: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 80%',
      once: true,
      onEnter: () =>
        gsap.to(o, {
          k: 1,
          duration: 1.8,
          ease: 'power3.out',
          onUpdate: () => {
            render(o.k);
            paintStrip(strip, o.k);
          },
          onComplete: () => {
            val.textContent = el.querySelector('.sr-only')!.textContent;
            paintStrip(strip, 1);
          },
        }),
    });
  }
}

/* ---------------- format ---------------- */
function initFormat() {
  const cv = $<HTMLCanvasElement>('[data-nyc-cv]');
  if (!cv) return;
  const map = createNyc(cv);
  if (!map) return;
  if (reduce) {
    map.set(1);
    window.addEventListener('resize', () => map.draw());
    return;
  }
  map.set(0.0001);
  map.set(0);
  ScrollTrigger.create({
    trigger: cv,
    start: 'top 90%',
    end: 'bottom 70%',
    scrub: 0.5,
    onUpdate: (st) => map.set(st.progress),
    onRefresh: (st) => {
      map.draw();
      map.set(st.progress);
    },
  });
}

/* ---------------- reveals ---------------- */
function initReveals() {
  if (reduce) return;
  for (const h of $$('[data-split]')) {
    const split = SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'ln' });
    gsap.set(h, { visibility: 'visible' });
    gsap.from(split.lines, {
      yPercent: 105,
      duration: 1.1,
      ease: 'expo.out',
      stagger: 0.07,
      scrollTrigger: { trigger: h, start: 'top 85%', once: true },
    });
  }
  for (const p of $$('[data-fade]')) {
    gsap.to(p, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', delay: 0.2, scrollTrigger: { trigger: p, start: 'top 90%', once: true } });
  }
  for (const s of $$('[data-stripes]')) {
    gsap.fromTo(
      $$('.stripes__c', s),
      { scaleY: 0 },
      { scaleY: 1, ease: 'none', stagger: { each: 0.02, from: 'random' }, scrollTrigger: { trigger: s, start: 'top 95%', end: 'bottom 60%', scrub: 0.5 } },
    );
  }
}

/* ---------------- boot ---------------- */
function boot() {
  initRequestModal();

  if (!reduce) {
    lenis = new Lenis({ lerp: 0.1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  window.addEventListener('request:open', () => {
    lenis?.stop();
    field?.setPaused(true);
  });
  window.addEventListener('request:close', () => {
    lenis?.start();
    field?.setPaused(false);
  });

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      if (hash === '#top' && lenis) {
        e.preventDefault();
        lenis.scrollTo(0, { duration: 1.2 });
      }
    }),
  );

  const hd = $('[data-hd]');
  const onScroll = () => hd?.classList.toggle('is-scrolled', window.scrollY > 16);
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  for (const fn of [initHero, initShift, initStats, initFormat]) {
    try {
      fn();
    } catch (err) {
      console.info('[v4b-near] section skipped', err);
    }
  }

  const refresh = () => ScrollTrigger.refresh();
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    try {
      initReveals();
    } catch (err) {
      console.info('[v4b-near] reveals skipped', err);
      root.classList.remove('v4bn-motion');
    }
    heroIntro();
    refresh();
  });
  window.addEventListener('load', refresh, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v4bn-motion');
  console.info('[v4b-near] boot failed, static page shown.', err);
}
window.__v4bnready = true;
