// NEAR Enclave 2027 — v4B-NEAR-1B boot (near.org dark warm, flat vector graphics).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { heroApply } from '../../content/copy';
import { createField, type Field } from './field';
import { createShift } from './shift';
import { createNyc, type Nyc } from './nyc';
import { hash } from './common';

declare global {
  interface Window {
    __v4bn1bready?: boolean;
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
let nyc: Nyc | null = null;

/* ---------------- hero ---------------- */
function initHero() {
  const cv = $<HTMLCanvasElement>('[data-hero-field]');
  if (!cv) return;
  // "NEAR Enclave 2027" from the h1 lead, without the colon, one word per vertical line
  const words = heroApply.h1Lead.replace(/:\s*$/, '').split(' ');
  field = createField(cv, { reduce, fine, words });
  if (!field) return;
  if (reduce) {
    field.renderStatic();
    window.addEventListener('resize', () => field?.renderStatic());
  } else {
    field.start();
    window.addEventListener('resize', () => field?.resize());
  }
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
    // Pin is short; the lock starts assembling while the section scrolls in, so it is formed
    // shortly after the pin engages and then holds sealed for the rest of the pin.
    ScrollTrigger.create({ trigger: sec, pin: '[data-shift-pin]', start: 'top top', end: '+=70%' });
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 75%',
      end: 'top -50%',
      scrub: 0.4,
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
      start: 'top 92%',
      end: 'center 65%',
      scrub: 0.4,
      onUpdate: (st) => sh.set(st.progress),
      onRefresh: (st) => {
        sh.draw();
        sh.set(st.progress);
      },
    });
  });
}

/* ---------------- stats ---------------- */
function paintStrip(bar: HTMLElement, p: number) {
  bar.style.setProperty('--p', p.toFixed(4));
  bar.classList.toggle('is-done', p >= 1);
}

function initStats() {
  const col = $('[data-stats-col]');
  if (col && !reduce) {
    gsap.fromTo(
      col,
      { clipPath: 'inset(0 0 100% 0)' },
      { clipPath: 'inset(0 0 0% 0)', ease: 'none', scrollTrigger: { trigger: '[data-stats]', start: 'top 70%', end: 'bottom 60%', scrub: 0.4 } },
    );
  }
  for (const el of $$('[data-stat]')) {
    const val = $('[data-stat-val]', el)!;
    const strip = $('[data-strip]', el)!;
    const n = +el.dataset.n!;
    const n2 = el.dataset.n2 ? +el.dataset.n2 : null;
    const d = +el.dataset.d!;
    const pre = el.dataset.pre || '';
    const suf = el.dataset.suf || '';
    const render = (k: number) => {
      val.textContent = pre + (n * k).toFixed(d) + (n2 !== null ? '–' + (n2 * k).toFixed(d) : '') + suf;
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
      start: 'top 82%',
      once: true,
      onEnter: () =>
        gsap.to(o, {
          k: 1,
          duration: 1.6,
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
  nyc = createNyc(cv, { reduce });
  if (!nyc) return;
  const map = nyc;
  if (reduce) {
    map.set(1);
    window.addEventListener('resize', () => map.draw());
    return;
  }
  map.set(0.0001);
  map.set(0);
  map.start();
  ScrollTrigger.create({
    trigger: cv,
    start: 'top 85%',
    end: 'bottom 75%',
    scrub: 0.5,
    onUpdate: (st) => map.set(st.progress),
    onRefresh: (st) => {
      map.draw();
      map.set(st.progress);
    },
  });
}

/* ---------------- dot bands ---------------- */
function initBands() {
  for (const band of $$('[data-dband]')) {
    const gs = $$('[data-c]', band);
    const thr = gs.map((g, i) => 0.15 + 0.7 * (i / gs.length) * 0.5 + hash(i, 31) * 0.35);
    const paint = (p: number) => gs.forEach((g, i) => g.classList.toggle('on', p >= thr[i]));
    if (reduce) {
      paint(1);
      continue;
    }
    paint(0);
    ScrollTrigger.create({
      trigger: band,
      start: 'top 95%',
      end: 'bottom 55%',
      scrub: true,
      onUpdate: (st) => paint(st.progress * 1.05),
    });
  }
}

/* ---------------- reveals ---------------- */
function initReveals() {
  if (reduce) return;
  for (const h of $$('[data-split]')) {
    const split = SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'ln' });
    gsap.set(h, { visibility: 'visible' });
    gsap.from(split.lines, {
      yPercent: 105,
      duration: 1,
      ease: 'expo.out',
      stagger: 0.07,
      scrollTrigger: { trigger: h, start: 'top 88%', once: true },
    });
  }
  for (const p of $$('[data-fade]')) {
    gsap.to(p, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', delay: 0.1, scrollTrigger: { trigger: p, start: 'top 92%', once: true } });
  }
}

/* ---------------- boot ---------------- */
function boot() {
  // hero first: its first frame is painted synchronously, before anything else boots
  try {
    initHero();
  } catch (err) {
    console.info('[v4b-near-1b] hero skipped', err);
  }

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
    nyc?.setPaused(true);
  });
  window.addEventListener('request:close', () => {
    lenis?.start();
    field?.setPaused(false);
    nyc?.setPaused(false);
  });

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const h = a.getAttribute('href') || '';
      if (h === '#top' && lenis) {
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

  for (const fn of [initShift, initStats, initFormat, initBands]) {
    try {
      fn();
    } catch (err) {
      console.info('[v4b-near-1b] section skipped', err);
    }
  }

  const refresh = () => ScrollTrigger.refresh();
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    try {
      initReveals();
    } catch (err) {
      console.info('[v4b-near-1b] reveals skipped', err);
      root.classList.remove('v4bn1b-motion');
    }
    refresh();
  });
  window.addEventListener('load', refresh, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v4bn1b-motion');
  console.info('[v4b-near-1b] boot failed, static page shown.', err);
}
window.__v4bn1bready = true;
