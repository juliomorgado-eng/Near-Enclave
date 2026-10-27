// NEAR Enclave 2027 — v4B-NEARCON "Módulo" boot.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, onReveal, checkPendingReveals, decrypt, scrollTargetY } from '../v3/util';
import { createHeroField, createSkyField, measureCharRatio, RAMP, type Field } from './ascii';

declare global {
  interface Window {
    __m4ready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

const root = document.documentElement;
let lenis: Lenis | null = null;
const fields: Field[] = [];
let hero: Field | null = null;
let sky: Field | null = null;

/* ---------------- fields ---------------- */
function initFields() {
  measureCharRatio();
  const hp = $('[data-ascii-hero]');
  const hh = $('[data-hero]');
  const hasGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  })();
  if (hp && hh && hasGL) {
    try {
      hero = createHeroField(hp, hh, { isStatic: reduceMotion });
      fields.push(hero);
      if (reduceMotion) hero.render();
    } catch (err) {
      hero = null;
      console.info('[v4b-nearcon] WebGL field unavailable, static frame kept.', err);
    }
  }
  const sp = $('[data-ascii-sky]');
  const sh = $('.af--sky');
  if (sp && sh) {
    sky = createSkyField(sp, sh, { isStatic: reduceMotion });
    fields.push(sky);
    if (!reduceMotion) {
      const stage = $('.format__stage')!;
      ScrollTrigger.create({
        trigger: stage,
        start: 'top 92%',
        end: 'center 45%',
        scrub: 0.6,
        onUpdate: (st) => sky?.setGrow?.(st.progress),
        onRefresh: (st) => sky?.setGrow?.(st.progress),
      });
    } else sky.setGrow?.(1);
  }
  let rz = 0;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    // mobile URL-bar resizes only change height slightly: ignore those
    if (Math.abs(window.innerWidth - lastW) < 2 && window.innerWidth < 768) return;
    lastW = window.innerWidth;
    clearTimeout(rz);
    rz = window.setTimeout(() => fields.forEach((f) => f.resize()), 160);
  });
  document.fonts?.ready.then(() => {
    measureCharRatio();
    fields.forEach((f) => f.resize());
  });
}

/* ---------------- rivers: pause off-screen ---------------- */
function initRivers() {
  if (reduceMotion) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-off', !e.isIntersecting)));
  $$('[data-rivers]').forEach((r) => {
    r.classList.add('is-off');
    io.observe(r);
  });
  window.addEventListener('request:open', () => $$('[data-rivers]').forEach((r) => r.classList.add('is-paused')));
  window.addEventListener('request:close', () => $$('[data-rivers]').forEach((r) => r.classList.remove('is-paused')));
}

/* ---------------- hero intro ---------------- */
function heroReveal(tl: gsap.core.Timeline, at: number) {
  const pre = $('[data-ascii-hero]');
  if (pre) tl.to(pre, { opacity: 1, duration: 0.3, ease: 'none' }, at);
  if (hero) {
    const st = { v: 0 };
    tl.to(st, { v: 1, duration: 1.4, ease: 'power2.out', onUpdate: () => hero?.setReveal(st.v) }, at);
  }
  tl.to('[data-hl]', { y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, at + 0.05);
  tl.to('[data-hf]', { opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.08 }, at + 0.35);
}

function runIntro(): Promise<void> {
  const loader = $('[data-loader]');
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: () => resolve() });
    if (loader) {
      const ramp = $('[data-ld-ramp]', loader)!;
      const bar = $('[data-ld-bar]', loader)!;
      const st = { n: 0 };
      tl.to(st, { n: RAMP.length, duration: 0.5, ease: 'none', onUpdate: () => (ramp.textContent = RAMP.slice(0, Math.round(st.n)).padEnd(RAMP.length, ' ')) }, 0);
      tl.to(bar, { scaleX: 1, duration: 0.55, ease: 'power2.inOut' }, 0);
      tl.to(loader, { yPercent: -100, duration: 0.45, ease: 'power3.inOut' }, 0.6);
      tl.add(() => {
        loader.remove();
        lenis?.start();
      }, 1.05);
      heroReveal(tl, 0.75);
    } else heroReveal(tl, 0);
  });
}

/* ---------------- sections ---------------- */
function initSections() {
  // h2 plates
  $$('[data-reveal-h2]').forEach((h) =>
    onReveal(h, () => gsap.fromTo(h, { y: 36, clipPath: 'inset(0 0 100% 0)' }, { y: 0, clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'expo.out', clearProps: 'all' }), 'top 92%'),
  );
  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })),
  );

  // Shift paragraph: block-glyph scramble, sentence by sentence, always settling to the real text
  const p = $('[data-scramble-p]');
  if (p) {
    const spans = $$('[data-scramble]', p);
    const texts = spans.map((s) => s.textContent ?? '');
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = texts.join(' ');
    p.after(sr);
    p.setAttribute('aria-hidden', 'true');
    const B = '░▒▓';
    spans.forEach((s, i) => (s.textContent = texts[i].replace(/\S/g, (_, k) => B[Math.floor(Math.abs(Math.sin(k * 12.9898 + i * 78.233)) * 43758.5453) % 3])));
    const settle = () => spans.forEach((s, i) => (s.textContent = texts[i]));
    onReveal(
      p,
      () => {
        const tl = gsap.timeline({ onComplete: settle, onInterrupt: settle });
        spans.forEach((s, i) => {
          tl.to(
            s,
            {
              duration: 1.1 + texts[i].length / 140,
              ease: 'none',
              scrambleText: { text: texts[i], chars: '█▓▒░', revealDelay: 0.15, speed: 0.55, tweenLength: false },
              onComplete: () => (s.textContent = texts[i]),
            },
            i * 0.32,
          );
        });
      },
      'top 80%',
    );
  }

  // Stats: pixel bars rise, floor bar extends, figures count up
  const grid = $('[data-stats]');
  if (grid) {
    onReveal(
      grid,
      () => {
        const cells = $$('[data-stat]', grid);
        cells.forEach((c, i) => {
          const d = i * 0.12;
          gsap.to($$('.px', c), { scaleY: 1, duration: 0.7, ease: 'steps(6)', stagger: 0.035, delay: d });
          gsap.to($$('.stat__value, .stat__label, .stat__source', c), { opacity: 1, duration: 0.6, stagger: 0.08, delay: d + 0.25 });
          const el = $('[data-stat-val]', c);
          if (!el) return;
          const n = parseFloat(el.dataset.number || '0');
          const to = el.dataset.numberTo ? parseFloat(el.dataset.numberTo) : null;
          const dec = parseInt(el.dataset.decimals || '0', 10);
          const pre = el.dataset.prefix || '';
          const suf = el.dataset.suffix || '';
          const fin = el.dataset.final || el.textContent || '';
          const st = { v: 0 };
          gsap.to(st, {
            v: 1,
            duration: 1.6,
            delay: d + 0.25,
            ease: 'power3.out',
            onUpdate: () => {
              const a = (n * st.v).toFixed(dec);
              el.textContent = to !== null ? `${pre}${a}–${(to * st.v).toFixed(dec)}${suf}` : `${pre}${a}${suf}`;
            },
            onComplete: () => (el.textContent = fin),
            onInterrupt: () => (el.textContent = fin),
          });
        });
        gsap.to($$('.fl', grid), { scaleX: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.3 });
      },
      'top 92%',
    );
  }
}

/* ---------------- modal ---------------- */
function initModalFx() {
  const modal = $('[data-request-modal]');
  if (!modal) return;
  const panel = $('[data-rq-panel]', modal)!;
  const form = $<HTMLFormElement>('form[data-request-form]', modal)!;
  const fieldsEl = $('[data-rq-fields]', modal)!;
  const seal = $('[data-rq-seal]', modal)!;
  const success = $('[data-request-success]', modal)!;
  window.addEventListener('request:open', () => {
    lenis?.stop();
    fields.forEach((f) => f.pause(true));
    if (reduceMotion) return;
    gsap.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.7, ease: 'expo.out', clearProps: 'transform' });
    gsap.fromTo($$('.rq__head, .rq__title, .rq__intro, .rq__form > *', panel), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.05, delay: 0.2, clearProps: 'opacity,transform' });
  });
  window.addEventListener('request:close', () => {
    fields.forEach((f) => f.pause(false));
    lenis?.start();
  });
  form.addEventListener('submit', () => {
    if (!form.hasAttribute('data-sent')) return;
    if (reduceMotion) {
      fieldsEl.hidden = true;
      return;
    }
    gsap.set(success, { opacity: 0 });
    gsap
      .timeline()
      .to(fieldsEl, { height: 0, opacity: 0, y: -24, duration: 0.6, ease: 'power4.inOut' })
      .to(seal, { scaleX: 1, duration: 0.6, ease: 'expo.inOut' }, '<0.1')
      .add(() => {
        fieldsEl.hidden = true;
        gsap.set(success, { opacity: 1 });
        decrypt(success, { duration: 0.6, chars: '█▓▒░' });
      });
  });
}

/* ---------------- boot ---------------- */
function boot() {
  initRequestModal();

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.09, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
  }

  initFields();
  initRivers();
  initModalFx();

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      const target = hash.length > 1 ? $(hash) : null;
      if (!target) return;
      if (lenis) {
        e.preventDefault();
        lenis.scrollTo(hash === '#top' ? 0 : scrollTargetY(target), { duration: 1.4 });
      }
    });
  });

  const hud = $('[data-hud]');
  const onScroll = () => hud?.classList.toggle('is-scrolled', window.scrollY > 24);
  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  if (reduceMotion) {
    $('[data-loader]')?.remove();
    start();
  } else {
    initSections();
    runIntro().finally(() => {
      $('[data-loader]')?.remove();
      lenis?.start();
      start();
    });
  }
  document.fonts?.ready.then(start);
  window.addEventListener('load', start, { once: true });
  window.addEventListener('pagehide', (e) => {
    if (!e.persisted) fields.forEach((f) => f.dispose());
  });
}

try {
  boot();
} catch (err) {
  root.classList.remove('m4-motion');
  $('[data-loader]')?.remove();
  console.info('[v4b-nearcon] boot failed, static page shown.', err);
}
window.__m4ready = true;
