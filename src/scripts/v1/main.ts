import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { initField } from './field';
import { initFaq } from './faq';

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => c.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => [...c.querySelectorAll<T>(s)];

declare global {
  interface Window {
    __v1ready?: boolean;
  }
}

/* ------------------------------------------------------------------ */
/* Always-on: modal, accordion, field, nav state                      */
/* ------------------------------------------------------------------ */
initRequestModal();
initFaq(reduce);
const field = initField($<HTMLCanvasElement>('[data-field]'), reduce);

let lenis: Lenis | null = null;
if (!reduce) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
window.addEventListener('request:open', () => lenis?.stop());
window.addEventListener('request:close', () => lenis?.start());

// Smooth anchor navigation through Lenis (native jump when reduced motion).
$$<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const hash = a.getAttribute('href') || '';
    const target = hash === '#top' ? $('#top') : hash.length > 1 ? $(hash) : null;
    if (!target) return;
    if (lenis) {
      e.preventDefault();
      lenis.scrollTo(hash === '#top' ? 0 : target, { duration: 1.6 });
      history.replaceState(null, '', hash);
    }
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }),
);

const nav = $('[data-nav]');
if (nav) {
  let last = 0;
  const onScroll = (y: number) => {
    nav.toggleAttribute('data-scrolled', y > 40);
    if (Math.abs(y - last) < 2) return;
    if (!reduce) {
      const down = y > last;
      nav.toggleAttribute('data-hidden', down && y > window.innerHeight * 0.6 && !nav.contains(document.activeElement));
    }
    last = y;
  };
  if (lenis) lenis.on('scroll', (l: Lenis) => onScroll(l.scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
  nav.addEventListener('focusin', () => nav.removeAttribute('data-hidden'));
  onScroll(window.scrollY);
}

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

// Run `fn` once when `el` reaches the viewport — also when the page was loaded
// already scrolled past it (so nothing can stay in its hidden initial state).
const pending: Array<() => void> = [];
function onReveal(el: Element, fn: () => void, start = 'top 88%') {
  let done = false;
  let st: ScrollTrigger | null = null;
  const run = () => {
    if (done) return;
    done = true;
    st?.kill();
    fn();
  };
  st = ScrollTrigger.create({ trigger: el, start, onEnter: run });
  const check = () => {
    if (!done && st && st.scroll() >= st.start) run();
  };
  pending.push(check);
  check();
}

const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789#%/<>';

// Left-to-right decrypt that keeps spaces in place, so word breaks never change and
// the block is locked to its final height (no reflow, no overflow while scrambling).
function scramble(el: HTMLElement, opts: { chars?: string; duration?: number } = {}) {
  const text = el.dataset.text || el.textContent || '';
  const chars = opts.chars ?? SCRAMBLE_CHARS;
  el.dataset.text = text;
  el.textContent = text;
  el.style.minHeight = `${el.offsetHeight}px`;
  gsap.set(el, { opacity: 1 });
  const state = { p: 0 };
  let last = -1;
  const render = () => {
    const cut = Math.floor(state.p * text.length);
    if (cut === last) return;
    last = cut;
    let out = text.slice(0, cut);
    for (let i = cut; i < text.length; i++) {
      const ch = text[i];
      out += /\s/.test(ch) ? ch : chars[(Math.random() * chars.length) | 0];
    }
    el.textContent = out;
  };
  return gsap.to(state, {
    p: 1,
    duration: opts.duration ?? gsap.utils.clamp(1, 2.4, text.length * 0.022),
    ease: 'power1.inOut',
    onUpdate: render,
    onComplete: () => {
      el.textContent = text;
      el.style.minHeight = '';
    },
  });
}

function splitReveal(el: HTMLElement) {
  gsap.set(el, { visibility: 'visible' });
  const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'sl' });
  gsap.from(split.lines, {
    yPercent: 105,
    duration: 1.2,
    stagger: 0.09,
    ease: 'expo.out',
    onComplete: () => split.revert(),
  });
}

function heroIntro() {
  const lead = $('[data-hero-lead]');
  const lines = $$('[data-hero-line]');
  const win = $('[data-aperture-window]');
  const readout = $('[data-aperture-val]');
  gsap.set([lead, ...lines], { visibility: 'visible' });

  const splits = lines.map((l) =>
    SplitText.create(l, { type: 'words,chars', mask: 'words', wordsClass: 'hero-l', aria: 'none' }),
  );

  // aperture state: --ap-x (intro slit) × (1 - --ap-scroll)
  const ap = { x: 50, s: 0 };
  const paint = () => {
    const inset = ap.x * (1 - ap.s);
    win?.style.setProperty('--ap-x', `${inset}%`);
    if (readout) readout.textContent = String(Math.round(100 - inset * 2)).padStart(3, '0');
    field.setOpen(1 - inset / 50);
  };
  paint();

  const tl = gsap.timeline({ delay: 0.1, defaults: { ease: 'expo.out' } });
  if (lead) {
    tl.add(() => {
      scramble(lead, { duration: 1.1 });
    }, 0);
  }
  splits.forEach((s, i) => {
    tl.from(s.chars, { yPercent: 115, rotate: 4, duration: 1.4, stagger: 0.03 }, 0.15 + i * 0.16);
  });
  // narrower intro slit on phones so it doesn't read as a sliver
  tl.to(ap, { x: window.innerWidth <= 640 ? 18 : 39, duration: 1.6, ease: 'expo.inOut', onUpdate: paint }, 0.45)
    .to('[data-hero-fade]', { opacity: 1, y: 0, duration: 1.1, stagger: 0.08 }, 0.9)
    .add(() => splits.forEach((s) => s.revert()));

  // Scroll: the enclave opens.
  gsap.to(ap, {
    s: 1,
    ease: 'none',
    onUpdate: paint,
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 },
  });
  gsap.to('.hero__title', {
    yPercent: -18,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

function countUp(el: HTMLElement) {
  const { prefix = '', suffix = '', final = '' } = el.dataset;
  const to = parseFloat(el.dataset.number || '0');
  const to2 = el.dataset.numberTo ? parseFloat(el.dataset.numberTo) : null;
  const dec = parseInt(el.dataset.decimals || '0', 10);
  const v = { a: 0, b: 0 };
  const fmt = () =>
    `${prefix}${v.a.toFixed(dec)}${to2 !== null ? `–${v.b.toFixed(dec)}` : ''}${suffix}`;
  el.textContent = fmt();
  gsap.to(v, {
    a: to,
    b: to2 ?? 0,
    duration: 2,
    ease: 'power3.out',
    onUpdate: () => {
      el.textContent = fmt();
    },
    onComplete: () => {
      el.textContent = final;
    },
  });
}

function motion() {
  heroIntro();

  // Generic fades
  $$('[data-reveal]').forEach((el) =>
    onReveal(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out' }), 'top 92%'),
  );

  // Headline line-mask reveals
  $$('[data-split]').forEach((el) => onReveal(el, () => splitReveal(el), 'top 90%'));

  // Shift: decrypt sentences
  $$('[data-scramble]').forEach((el) => onReveal(el, () => scramble(el), 'top 85%'));
  const key = $('[data-key]');
  const keyText = $('[data-key-text]');
  if (key && keyText) {
    onReveal(
      key,
      () => {
        gsap.to(key, { clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'expo.inOut' });
        gsap.delayedCall(0.55, () => scramble(keyText, { chars: '█▓▒░/#', duration: 1.6 }));
      },
      'top 80%',
    );
  }

  // Stats: count-up (initial zeroed state is set on reveal only)
  // starts just before the card fades in, so the final value never flashes first
  $$('[data-count]').forEach((el) => onReveal(el, () => countUp(el), 'top 97%'));

  const mm = gsap.matchMedia();

  // Format: pinned, scrubbed reveal on large screens
  const format = $('[data-format]');
  const media = $('[data-format-media]');
  const img = media?.querySelector('img');
  const paras = $$('[data-format-p]');
  mm.add('(min-width: 1024px) and (min-height: 760px)', () => {
    if (!format || !media) return;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: format, start: 'top top', end: '+=140%', pin: true, scrub: 0.8, anticipatePin: 1 },
    });
    tl.fromTo(media, { '--clip': '28%' }, { '--clip': '0%', ease: 'power2.inOut', duration: 1 }, 0)
      .fromTo(img!, { '--img-s': 1.35 }, { '--img-s': 1, ease: 'none', duration: 1.4 }, 0)
      .fromTo(paras, { opacity: 0.35 }, { opacity: 1, ease: 'none', duration: 0.25, stagger: 0.22 }, 0.05);
  });
  mm.add('(max-width: 1023px), (max-height: 759px)', () => {
    paras.forEach((p) => {
      gsap.set(p, { opacity: 0, y: 30 });
      onReveal(p, () => gsap.to(p, { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }), 'top 92%');
    });
    if (media) onReveal(media, () => gsap.fromTo(media, { '--clip': '20%' }, { '--clip': '0%', duration: 1.4, ease: 'expo.out' }));
  });

  // Agenda: stacked sticky cards compress as the next one lands
  const tracks = $$('[data-track]');
  mm.add('(min-width: 900px) and (min-height: 640px)', () => {
    tracks.forEach((t, i) => {
      const next = tracks[i + 1];
      if (!next) return;
      const shade = t.querySelector('[data-track-shade]');
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: next,
          start: 'top bottom',
          end: () => `top ${parseFloat(getComputedStyle(next).top) || 100}px`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
      tl.to(t, { scale: 0.94, ease: 'none' }, 0).to(shade, { opacity: 0.22, ease: 'none' }, 0);
    });
  });
  mm.add('(max-width: 899px), (max-height: 639px)', () => {
    tracks.forEach((t) => {
      gsap.set(t, { opacity: 0, y: 40 });
      onReveal(t, () => gsap.to(t, { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }), 'top 92%');
    });
  });

  // Speakers: redaction bars draw in; hovering "tries" to reveal and re-redacts
  $$('[data-rcard]').forEach((card, i) => {
    const bars = $$('[data-bar]', card);
    gsap.set(card, { opacity: 0, y: 30 });
    gsap.set(bars, { scaleX: 0 });
    onReveal(
      card,
      () => {
        gsap.to(card, { opacity: 1, y: 0, duration: 1, delay: (i % 4) * 0.08, ease: 'expo.out' });
        gsap.to(bars, { scaleX: 1, duration: 0.9, stagger: 0.12, delay: 0.25 + (i % 4) * 0.08, ease: 'expo.inOut' });
      },
      'top 92%',
    );
    card.addEventListener('mouseenter', () => {
      gsap.fromTo(bars, { scaleX: 0.15 }, { scaleX: 1, duration: 0.7, stagger: 0.06, ease: 'expo.out', overwrite: true });
    });
  });
}

try {
  if (!reduce) motion();
  window.__v1ready = true;
} catch (err) {
  // Never leave content hidden.
  root.classList.remove('motion');
  window.__v1ready = true;
  console.warn('[v1] motion disabled:', err);
}

const refresh = () => {
  ScrollTrigger.refresh();
  pending.forEach((c) => c());
};
document.fonts?.ready.then(refresh);
window.addEventListener('load', refresh, { once: true });
