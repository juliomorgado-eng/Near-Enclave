// NEAR Enclave 2027 — v4B-NEARCON 2A boot (forked from 1B).
// 2A: no loader. The hero is a pinned stage: the ASCII coin-in-cube is moving from the first frame
// (time-driven), and through the runway it opens from the band under the title to the full
// viewport while the cube seals (scroll-driven). Then the cream Shift panel rises over the stage
// (v4A-NEARCON 1A cover) and the page stays in light mode down to the dark footer.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, onReveal, checkPendingReveals, decrypt, scrollTargetY } from '../v3/util';
import { createHeroField, createShiftField, createSkyField, measureCharRatio, type Field, type HeroField } from './ascii';

declare global {
  interface Window {
    __m4ready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
let lenis: Lenis | null = null;
const fields: Field[] = [];
let hero: HeroField | null = null;
let sky: Field | null = null;
let modalOpen = false;
let heroCovered = false;
const syncHeroPause = () => hero?.pause(modalOpen || heroCovered);

/* ---------------- hero framing ----------------
   The band starts under the title block: its top edge (the stage rule) is measured in px and
   written as --clip; the field fits the object between that edge and the sub/CTA (phones) or the
   bottom of the stage (desktop). At the end of the runway it fits between the HUD and the bottom. */
function frameHero() {
  const stage = $('[data-hero]');
  const head = $('[data-hero-head]');
  const foot = $('[data-hero-foot]');
  if (!stage || !head) return;
  const H = stage.clientHeight || window.innerHeight;
  const sb = stage.getBoundingClientRect();
  const gap = Math.max(18, Math.min(40, H * 0.035));
  const clip = Math.round(head.getBoundingClientRect().bottom - sb.top + gap);
  stage.style.setProperty('--clip', `${clip}px`);
  const phone = window.innerWidth < 768;
  const footTop = foot ? foot.getBoundingClientRect().top - sb.top : H;
  const bottom = phone ? (footTop - 12) / H : 0.985;
  const hud = parseFloat(getComputedStyle(root).getPropertyValue('--hud')) || 68;
  hero?.setFrame({ top: (clip + 14) / H, bottom: Math.max((clip + 80) / H, bottom) }, { top: (hud + 12) / H, bottom: 0.97 });
}

/* ---------------- fields ---------------- */
function initFields() {
  measureCharRatio();
  const hp = $('[data-ascii-hero]');
  const hh = $('[data-band]');
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
      frameHero();
      hero.render();
    } catch (err) {
      hero = null;
      console.info('[v4b-nearcon-2e] WebGL field unavailable, static frame kept.', err);
    }
  }
  const shp = $('[data-ascii-shift]');
  const shh = $('.af--shift');
  if (shp && shh) {
    try {
      fields.push(createShiftField(shp, shh, { isStatic: reduceMotion }));
    } catch (err) {
      console.info('[v4b-nearcon-2e] shift field unavailable.', err);
    }
  }
  const sp = $('[data-ascii-sky]');
  const sh = $('.af--sky');
  if (sp && sh) {
    sky = createSkyField(sp, sh, { isStatic: reduceMotion });
    fields.push(sky);
    if (!reduceMotion) {
      ScrollTrigger.create({
        trigger: $('.format__stage')!,
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
    rz = window.setTimeout(() => {
      fields.forEach((f) => f.resize());
      frameHero();
    }, 160);
  });
  document.fonts?.ready.then(() => {
    measureCharRatio();
    fields.forEach((f) => f.resize());
    frameHero();
  });
}

/* ---------------- hero: intro (no loader; the field is live from frame one) ---------------- */
function heroIntro() {
  const tl = gsap.timeline();
  const st = { v: 0.3 };
  if (hero) tl.to(st, { v: 1, duration: 1.1, ease: 'power2.out', onUpdate: () => hero?.setReveal(st.v) }, 0);
  tl.to('.h1__title .ch', { y: 0, duration: 1, ease: 'expo.out', stagger: 0.028 }, 0.05);
  tl.to('[data-hl]', { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.1 }, 0.45);
  tl.to('[data-ruleline]', { scaleX: 1, duration: 1.1, ease: 'expo.inOut' }, 0.3);
  tl.to('[data-hf]', { opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.07 }, 0.6);
  return tl;
}

/* ---------------- hero: pinned runway + cover ---------------- */
function initStage() {
  const cover = $('[data-cover]');
  const runway = $('[data-runway]');
  const stage = $('[data-hero]');
  const shift = $('[data-shift]');
  const inner = $('[data-hero-in]');
  const shade = $('[data-shade]');
  if (!cover || !runway || !stage || !shift) return;

  // pause the time loop once the cream panel fully covers the stage
  ScrollTrigger.create({
    trigger: shift,
    start: 'top top',
    end: 'max',
    onToggle: (s) => {
      heroCovered = s.isActive;
      syncHeroPause();
    },
  });
  if (reduceMotion) return;

  // runway: band → full viewport, title out, cube seals
  const p = { v: 0 };
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: cover,
      start: 'top top',
      end: () => `+=${runway.offsetHeight}`,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });
  tl.to(p, { v: 1, duration: 1, onUpdate: () => hero?.setGrow?.(p.v) }, 0);
  tl.fromTo(stage, { '--k': 1 }, { '--k': 0, duration: 0.42, ease: 'power1.inOut' }, 0);
  tl.to('[data-hero-head]', { yPercent: -28, opacity: 0, duration: 0.3, ease: 'power1.in' }, 0);
  tl.to('[data-hero-foot]', { y: 24, opacity: 0, duration: 0.2, ease: 'power1.in' }, 0);
  tl.to('[data-rule]', { opacity: 0, duration: 0.3 }, 0.06);

  // cover: the stage recedes under the rising cream panel
  if (inner && shade) {
    gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: shift, start: 'top bottom', end: 'top top', scrub: true } })
      .to(inner, { scale: 0.93, yPercent: -4 }, 0)
      .to(shade, { opacity: 0.65 }, 0);
  }
}

/* ---------------- header: cream on dark zones, ink on cream (from v4A-NEARCON 1A) ---------------- */
function initHud() {
  const hud = $('[data-hud]');
  const shift = $('[data-shift]');
  const dark = $$('[data-dark]');
  if (!hud) return;
  const update = () => {
    const y = hud.offsetHeight / 2;
    let onDark = !!shift && shift.getBoundingClientRect().top > y;
    if (!onDark)
      for (const d of dark) {
        const b = d.getBoundingClientRect();
        if (b.top <= y && b.bottom >= y) {
          onDark = true;
          break;
        }
      }
    hud.classList.toggle('is-light', !onDark);
    hud.classList.toggle('is-scrolled', onDark && window.scrollY > 24);
  };
  if (lenis) lenis.on('scroll', update);
  else window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------------- sections ---------------- */
function initSections() {
  $$('[data-reveal-h2]').forEach((h) =>
    onReveal(h, () => gsap.fromTo(h, { y: 36, clipPath: 'inset(0 0 100% 0)' }, { y: 0, clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'expo.out', clearProps: 'all' }), 'top 92%'),
  );
  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })),
  );
  // hairlines that trace themselves (v4A-NEARCON 1A line language)
  $$('[data-rule-x]').forEach((r) => onReveal(r, () => gsap.to(r, { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }), 'top 94%'));

  initStats();

  const floor = $('.closing__floor');
  if (floor) onReveal(floor, () => gsap.to($$('.fl', floor), { scaleX: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 }), 'top 92%');

  const mark = $('[data-foot-mark]');
  if (mark) onReveal(mark, () => gsap.fromTo($$('.foot__mk', mark), { y: 0, yPercent: 104 }, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }), 'top 96%');
}

/* ---------------- stats: count-ups, accent tick timelines, the tracing rail ---------------- */
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
    if (on) gsap.fromTo(on, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: st, start: 'top 90%', end: 'top 45%', scrub: true } });

    // rail: the ring traces as its stat arrives, fills when it reaches the reading line (68%),
    // then the hairline below it draws down at the reading line's pace
    const ring = st.querySelector('[data-rail-ring]');
    const fill = st.querySelector('[data-rail-fill]');
    const ln = st.querySelector('[data-rail-ln]');
    if (ring) gsap.fromTo(ring, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: st, start: 'top 88%', end: 'top 68%', scrub: 0.4 } });
    if (fill) gsap.fromTo(fill, { attr: { r: 0 } }, { attr: { r: 5 }, ease: 'back.out(2)', scrollTrigger: { trigger: st, start: 'top 69%', end: 'top 62%', scrub: 0.4 } });
    if (ln) gsap.fromTo(ln, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: st, start: 'top 68%', end: 'bottom 68%', scrub: 0.4 } });
  });
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
    modalOpen = true;
    lenis?.stop();
    fields.forEach((f) => f !== hero && f.pause(true));
    syncHeroPause();
    if (reduceMotion) return;
    gsap.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: 0.7, ease: 'expo.out', clearProps: 'transform' });
    gsap.fromTo($$('.rq__head, .rq__title, .rq__intro, .rq__form > *', panel), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.05, delay: 0.2, clearProps: 'opacity,transform' });
  });
  window.addEventListener('request:close', () => {
    modalOpen = false;
    fields.forEach((f) => f !== hero && f.pause(false));
    syncHeroPause();
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
  }

  initFields();
  initModalFx();
  initStage();
  initHud();

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

  const start = () => {
    frameHero();
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  if (!reduceMotion) {
    initSections();
    heroIntro();
  }
  start();
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
  console.info('[v4b-nearcon-2e] boot failed, static page shown.', err);
}
window.__m4ready = true;
