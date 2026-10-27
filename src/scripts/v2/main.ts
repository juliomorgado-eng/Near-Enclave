import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { initHeroCanvas } from './hero-canvas';

const NAV_OFFSET = 72;
let lenis: Lenis | null = null;

export function boot() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Behaviour that must work for everyone (incl. reduced motion).
  safe(initRequestModal);
  safe(initNav);
  safe(initMenu);
  safe(initFaq);
  safe(() => initHeroCanvas(reduce));

  if (!reduce) {
    gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);
    safe(initLenis);
    safe(initHeroIntro);
    safe(initReveals);
    safe(initCounters);
    safe(initParallax);
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => {});
    window.addEventListener('load', refresh, { once: true });
  }
  safe(initAnchors);

  (window as unknown as { __v2ready: boolean }).__v2ready = true;
}

function safe(fn: () => void) {
  try {
    fn();
  } catch (err) {
    // Never leave content hidden because one enhancement failed.
    document.documentElement.classList.add('anim-off');
    if (import.meta.env.DEV) console.warn('[v2]', err);
  }
}

/* ---------------------------------------------------------------- Lenis */
function initLenis() {
  lenis = new Lenis({ duration: 1.05, smoothWheel: true, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  window.addEventListener('request:open', () => lenis?.stop());
  window.addEventListener('request:close', () => lenis?.start());
}

/* ---------------------------------------------------------------- Anchors */
function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || a.hasAttribute('data-open-request')) return;
    const id = a.getAttribute('href')!.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    closeMenu();
    const focusTarget = () => {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    // Absolute y: passing the element to Lenis also applied html scroll-padding-top (double offset).
    const y = id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET + 8;
    if (lenis) {
      lenis.scrollTo(y, { onComplete: focusTarget });
    } else {
      window.scrollTo({ top: y });
      focusTarget();
    }
    history.replaceState(null, '', id === 'top' ? location.pathname : `#${id}`);
  });
}

/* ---------------------------------------------------------------- Nav */
function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!nav || !hero) return;

  // Over the hero the nav is transparent until content starts scrolling under it.
  const onScroll = () => nav.toggleAttribute('data-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  new IntersectionObserver(
    ([e]) => {
      nav.dataset.tone = e.isIntersecting ? 'dark' : 'light';
    },
    { rootMargin: `-${NAV_OFFSET - 8}px 0px 0px 0px` },
  ).observe(hero);

  // Active section indicator.
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav__links [data-nav-link]')];
  const map = new Map<Element, HTMLAnchorElement>();
  links.forEach((l) => {
    const s = document.getElementById(l.hash.slice(1));
    if (s) map.set(s, l);
  });
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const l = map.get(e.target);
        if (!l) return;
        if (e.isIntersecting) {
          links.forEach((x) => x.removeAttribute('aria-current'));
          l.setAttribute('aria-current', 'true');
        } else if (l.getAttribute('aria-current')) {
          l.removeAttribute('aria-current');
        }
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  map.forEach((_, s) => io.observe(s));
}

/* ---------------------------------------------------------------- Mobile menu */
let closeMenu = () => {};
function initMenu() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const btn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const panel = document.querySelector<HTMLElement>('[data-menu]');
  if (!nav || !btn || !panel) return;
  const set = (open: boolean) => {
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    nav.toggleAttribute('data-menu-open', open);
  };
  closeMenu = () => set(false);
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      set(false);
      btn.focus();
    }
  });
  panel.querySelectorAll('[data-open-request]').forEach((el) => el.addEventListener('click', () => set(false)));
  matchMedia('(min-width: 1080px)').addEventListener('change', (m) => m.matches && set(false));
}

/* ---------------------------------------------------------------- FAQ */
function initFaq() {
  const root = document.querySelector<HTMLElement>('[data-faq]');
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-qa]').forEach((qa) => {
    const btn = qa.querySelector<HTMLButtonElement>('[data-qa-btn]')!;
    const panel = qa.querySelector<HTMLElement>('[data-qa-panel]')!;
    const set = (open: boolean) => {
      btn.setAttribute('aria-expanded', String(open));
      qa.toggleAttribute('data-open', open);
      panel.inert = !open;
    };
    set(false);
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  });
  root.classList.add('is-ready');
}

/* ---------------------------------------------------------------- Hero intro */
function initHeroIntro() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;
  const words = hero.querySelectorAll('.word');
  const fades = hero.querySelectorAll('[data-hero-fade]');
  const rule = hero.querySelector('[data-hero-rule]');

  const tl = gsap.timeline({ delay: 0.1, defaults: { ease: 'power3.out' } });
  tl.fromTo(
    words,
    { opacity: 0, yPercent: 35 },
    { opacity: 1, yPercent: 0, duration: 0.8, stagger: 0.055, clearProps: 'transform' },
    0,
  );
  if (rule) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, 0.35);
  tl.fromTo(fades, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, clearProps: 'transform' }, 0.45);

  hero.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el, i) => {
    const text = el.textContent ?? '';
    gsap.to(el, {
      duration: 0.9,
      delay: 0.15 + i * 0.12,
      scrambleText: { text, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', speed: 0.6, revealDelay: 0.25 },
      onComplete: () => {
        el.textContent = text;
      },
    });
  });
}

/* ---------------------------------------------------------------- Reveals */
function initReveals() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        // Reveal when in view, or when already scrolled past (mid-page reloads, fast jumps).
        if (e.isIntersecting || e.boundingClientRect.bottom < 0) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0 },
  );
  els.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------------- Count-up */
function initCounters() {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    // Already visible (or passed) at load: keep the final value, no jump.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    const d = el.dataset;
    const n = Number(d.number);
    const to = d.numberTo ? Number(d.numberTo) : null;
    const dec = Number(d.decimals) || 0;
    const final = d.final ?? el.textContent ?? '';
    const fmt = (v: number) => v.toFixed(dec);
    const render = (p: number) => {
      el.textContent = `${d.prefix ?? ''}${fmt(n * p)}${to !== null ? `–${fmt(to * p)}` : ''}${d.suffix ?? ''}`;
    };
    render(0);
    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => {
        const o = { p: 0 };
        gsap.to(o, {
          p: 1,
          duration: 1.4,
          ease: 'power3.out',
          onUpdate: () => render(o.p),
          onComplete: () => {
            el.textContent = final;
          },
        });
      },
    });
  });
}

/* ---------------------------------------------------------------- Parallax */
function initParallax() {
  gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((img) => {
    gsap.fromTo(
      img,
      { yPercent: -5 },
      {
        yPercent: 5,
        ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });
}
