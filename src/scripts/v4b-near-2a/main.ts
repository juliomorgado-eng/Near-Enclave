// NEAR Enclave 2027 — v4B-NEAR-2A boot ("Launch Film" direction).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { createStage, type Stage } from './stage';

declare global {
  interface Window {
    __v4bn2aready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => c.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => [...c.querySelectorAll<T>(s)];
let lenis: Lenis | null = null;
let stage: Stage | null = null;

/* ---------------- stage (all graphics) ---------------- */
function initStage() {
  const cv = $<HTMLCanvasElement>('[data-film]');
  if (!cv) return;
  stage = createStage(cv, { reduce });
  if (!stage) return;
  const logo = $<SVGElement>('.ft__logo');
  stage.onSolid((v) => logo?.style.setProperty('--solid', v.toFixed(3)));
  stage.start();
}

/* ---------------- shift: pin + scrub the film's local time ---------------- */
function initShift() {
  const sec = $('[data-shift]');
  if (!sec || !stage) return;
  const P = stage.P;
  if (reduce) { P.shift = 1; return; }
  const mm = gsap.matchMedia();
  mm.add('(min-width: 768px) and (min-height: 600px)', () => {
    ScrollTrigger.create({ trigger: sec, pin: '[data-shift-pin]', start: 'top top', end: '+=80%' });
    ScrollTrigger.create({ trigger: sec, start: 'top 85%', end: 'top -55%', scrub: 0.4, onUpdate: (st) => (P.shift = st.progress) });
  });
  mm.add('not all and (min-width: 768px) and (min-height: 600px)', () => {
    ScrollTrigger.create({ trigger: '[data-slot="shift"]', start: 'top 95%', end: 'center 45%', scrub: 0.4, onUpdate: (st) => (P.shift = st.progress) });
  });
}

/* ---------------- stats: count up; the figure in view picks the lit plane ---------------- */
function initStats() {
  const P = stage?.P;
  for (const el of $$('[data-stat]')) {
    const i = +el.dataset.stat!;
    const val = $('[data-stat-val]', el)!;
    const ruler = $('[data-ruler]', el);
    const n = +el.dataset.n!;
    const n2 = el.dataset.n2 ? +el.dataset.n2 : null;
    const d = +el.dataset.d!;
    const pre = el.dataset.pre || '';
    const suf = el.dataset.suf || '';
    if (P) {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 60%',
        end: 'bottom 40%',
        onToggle: (st) => {
          el.classList.toggle('is-on', st.isActive);
          if (st.isActive) P.stat = i;
          else if (P.stat === i) P.stat = -1;
        },
      });
    }
    if (reduce) continue;
    const render = (k: number) => {
      val.textContent = pre + (n * k).toFixed(d) + (n2 !== null ? '–' + (n2 * k).toFixed(d) : '') + suf;
    };
    render(0);
    if (ruler) gsap.set(ruler, { scaleX: 0 });
    const o = { k: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        if (ruler) gsap.to(ruler, { scaleX: 1, duration: 1.4, ease: 'expo.out' });
        gsap.to(o, {
          k: 1,
          duration: 1.6,
          ease: 'expo.out',
          onUpdate: () => render(o.k),
          onComplete: () => { val.textContent = el.querySelector('.sr-only')!.textContent; },
        });
      },
    });
  }
}

/* ---------------- audience: rows light as the list passes ---------------- */
function initAudience() {
  const P = stage?.P;
  const items = $$('[data-aud]');
  if (!P || !items.length) return;
  if (reduce) {
    P.aud = items.length;
    items.forEach((it) => it.classList.add('is-on'));
    return;
  }
  items.forEach((it, i) =>
    ScrollTrigger.create({
      trigger: it,
      start: 'top 62%',
      onToggle: (st) => {
        it.classList.toggle('is-on', st.isActive || st.progress === 1);
        P.aud = Math.max(0, items.filter((x) => x.classList.contains('is-on')).length);
        void i;
      },
    }),
  );
}

/* ---------------- header theme + footer chapter strip ---------------- */
function initChrome() {
  const hd = $('[data-hd]');
  const nights = $$('.is-night, .is-ink');
  const chaps = $$<HTMLAnchorElement>('[data-chap]');
  const targets = chaps.map((a) => document.getElementById(a.dataset.chap!));
  const onScroll = () => {
    if (hd) {
      hd.classList.toggle('is-scrolled', window.scrollY > 16);
      const y = hd.getBoundingClientRect().top + hd.offsetHeight / 2;
      hd.classList.toggle('is-dark', nights.some((n) => { const r = n.getBoundingClientRect(); return r.top <= y && r.bottom > y; }));
    }
    let on = -1;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < innerHeight * 0.5) on = i; });
    chaps.forEach((c, i) => c.classList.toggle('is-on', i === on));
  };
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------------- reveals (film: words rise through a mask, outExpo) ---------------- */
function initReveals() {
  if (reduce) return;
  for (const h of $$('[data-split]')) {
    const split = SplitText.create(h, { type: 'lines', mask: 'lines', linesClass: 'ln' });
    gsap.set(h, { visibility: 'visible' });
    gsap.from(split.lines, {
      yPercent: 115,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.06,
      scrollTrigger: { trigger: h, start: 'top 88%', once: true },
    });
  }
  for (const p of $$('[data-fade]')) {
    gsap.to(p, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', delay: 0.08, scrollTrigger: { trigger: p, start: 'top 92%', once: true } });
  }
}

/* ---------------- boot ---------------- */
function boot() {
  try {
    initStage();
  } catch (err) {
    console.info('[v4b-near-2a] stage skipped', err);
  }

  initRequestModal();

  if (!reduce) {
    lenis = new Lenis({ lerp: 0.1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  window.addEventListener('request:open', () => { lenis?.stop(); stage?.setPaused(true); });
  window.addEventListener('request:close', () => { lenis?.start(); stage?.setPaused(false); });

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const h = a.getAttribute('href') || '';
      if (!lenis || h.length < 2) return;
      const target = h === '#top' ? 0 : document.querySelector<HTMLElement>(h);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.4, offset: h === '#top' ? 0 : -64 });
    }),
  );

  for (const fn of [initShift, initStats, initAudience, initChrome]) {
    try {
      fn();
    } catch (err) {
      console.info('[v4b-near-2a] section skipped', err);
    }
  }

  const refresh = () => ScrollTrigger.refresh();
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    try {
      initReveals();
    } catch (err) {
      console.info('[v4b-near-2a] reveals skipped', err);
      root.classList.remove('v4bn2a-motion');
    }
    refresh();
  });
  window.addEventListener('load', refresh, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v4bn2a-motion');
  console.info('[v4b-near-2a] boot failed, static page shown.', err);
}
window.__v4bn2aready = true;
