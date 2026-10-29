// NEAR Enclave 2027 — v4B-NEARCON 1A boot.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, onReveal, checkPendingReveals, decrypt, scrollTargetY } from '../v3/util';
import { createHeroField, createShiftField, createSkyField, measureCharRatio, RAMP, type Field } from './ascii';

declare global {
  interface Window {
    __m4ready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger);

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
      console.info('[v4b-nearcon-1a] WebGL field unavailable, static frame kept.', err);
    }
  }
  const shp = $('[data-ascii-shift]');
  const shh = $('.af--shift');
  if (shp && shh) {
    try {
      const f = createShiftField(shp, shh, { isStatic: reduceMotion });
      fields.push(f);
    } catch (err) {
      console.info('[v4b-nearcon-1a] shift field unavailable.', err);
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

  initStats();

  // closing: pixel floor extends under the CTA
  const floor = $('.closing__floor');
  if (floor) onReveal(floor, () => gsap.to($$('.fl', floor), { scaleX: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 }), 'top 92%');
}

/* ---------------- stats (ported from v4a-near): count up + tick-timeline active stretch ---------------- */
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
      // screen readers get the final value only
      v.setAttribute('aria-label', final);
      const o = { t: 0 };
      const render = () => {
        const a = (n * o.t).toFixed(d);
        v.textContent = n2 != null ? `${pre}${Math.round(n * o.t)}–${Math.round(n2 * o.t)}${suf}` : `${pre}${a}${suf}`;
      };
      render();
      onReveal(
        v,
        () => {
          gsap.to(o, { t: 1, duration: 1.4, ease: 'expo.out', onUpdate: render, onComplete: () => (v.textContent = final), onInterrupt: () => (v.textContent = final) });
        },
        'top 85%',
      );
    }
    const on = st.querySelector<HTMLElement>('[data-st-on]');
    if (on) gsap.fromTo(on, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: st, start: 'top 90%', end: 'top 40%', scrub: true } });
  });
  const stripe = $('[data-stripe]');
  if (stripe) gsap.fromTo(stripe, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '[data-stats]', start: 'top 80%', end: 'bottom 70%', scrub: true } });
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
  console.info('[v4b-nearcon-1a] boot failed, static page shown.', err);
}
window.__m4ready = true;
