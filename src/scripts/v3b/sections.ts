// v3B choreography. One idea across the three sections: ciphertext goes into the
// enclave, only a verified result comes out — and that result is the copy itself.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { $, $$, decrypt, onReveal, rand, clamp } from '../v3/util';

export const live = {
  intro: 1,
  /** element the enclave is currently emitting (beam target) */
  out: null as HTMLElement | null,
  pulse: (_v?: number) => {},
};

const SCR = '01#$/\\+×≡<>%0123456789ABCDEF';

/**
 * Scrub-able decrypt with zero reflow: each char keeps its real glyph (transparent)
 * and paints a cipher glyph on top via ::after until it settles.
 */
export function scrambler(el: HTMLElement, chars = SCR, win = 0.3, hideAhead = false) {
  const split = SplitText.create(el, { type: 'words,chars', charsClass: 'sc', wordsClass: 'sw' });
  const cs = (split.chars as HTMLElement[]).filter((c) => (c.textContent ?? '').trim() !== '');
  const n = cs.length;
  const settled = new Array(n).fill(true);
  let frame = 0;
  let last = -1;
  function render(p: number) {
    frame++;
    if (p === last && (p >= 1 || p <= 0 || frame % 4)) return;
    last = p;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * (1 - win);
      const local = (p - t) / win;
      const c = cs[i];
      if (local >= 1) {
        if (!settled[i]) {
          c.classList.remove('is-x', 'is-h');
          settled[i] = true;
        }
      } else if (hideAhead && local <= 0) {
        // not reached yet: keep the slot, show nothing (no wall of cipher glyphs)
        c.classList.add('is-h');
        c.classList.remove('is-x');
        settled[i] = false;
      } else {
        const fresh = !c.classList.contains('is-x');
        c.classList.remove('is-h');
        if (fresh || frame % 4 === 0) c.dataset.g = rand(chars);
        if (fresh) c.classList.add('is-x');
        settled[i] = false;
      }
    }
  }
  return { render, revert: () => split.revert() };
}

/* ---------- reveals ---------- */
export function initReveals() {
  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'transform' }), 'top 92%'),
  );
}

/* ---------- hero ---------- */
export function heroReveal(tl: gsap.core.Timeline, at: number) {
  const lines = $$('[data-hero-line]');
  const kicker = $('[data-hero-kicker]');
  tl.to(lines, { y: 0, yPercent: 0, duration: 1.0, ease: 'expo.out', stagger: 0.07 }, at);
  if (kicker) {
    tl.set(kicker, { opacity: 1 }, at);
    tl.add(() => decrypt(kicker, { duration: 0.5 }), at);
  }
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 }, at + 0.1);
  tl.fromTo('[data-hero-cta]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, at + 0.25);
  tl.fromTo(live, { intro: 0 }, { intro: 1, duration: 1.2, ease: 'expo.out' }, at - 0.2);
}

export function initHero() {
  gsap.to('.hero__copy', {
    yPercent: -8,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/* ---------- shift ---------- */
export function initShift() {
  const sec = $('#shift');
  const h2 = $('[data-shift-h2]');
  if (!sec || !h2) return;
  const items = $$('[data-shift-s]', sec);
  // headline: a narrow cipher front sweeps through; unreached letters stay hidden
  const h2s = scrambler(h2, SCR, 0.1, true);
  const scr = items.map((el) => scrambler($('[data-shift-t]', el)!));
  const mm = gsap.matchMedia();

  // the headline decrypts as it comes into view (all widths)
  h2s.render(0);
  const hs = { p: 0 };
  gsap.to(hs, {
    p: 1,
    ease: 'none',
    onUpdate: () => h2s.render(hs.p),
    onComplete: () => h2s.render(1),
    scrollTrigger: { trigger: h2, start: 'top 88%', end: 'top 62%', scrub: 0.5 },
  });

  mm.add('(min-width: 1024px)', () => {
    const START = [0.04, 0.26, 0.48, 0.7];
    const LEN = 0.14;
    const pulsed = items.map(() => false);
    const render = (P: number) => {
      let current = -1;
      START.forEach((s, i) => {
        if (P >= s) current = i;
      });
      items.forEach((el, i) => {
        const lp = clamp((P - START[i]) / LEN);
        scr[i].render(lp);
        const vis = Math.min(1, lp * 4);
        const dim = i === current || P > 0.9 ? 1 : 0.42;
        el.style.opacity = String(vis * dim);
        const e = 1 - Math.pow(1 - Math.min(1, lp * 2), 3);
        el.style.transform = `translate3d(${(1 - e) * -32}px,0,0)`;
        el.classList.toggle('is-cur', i === current && P <= 0.9);
        if (lp >= 1 && !pulsed[i]) {
          pulsed[i] = true;
          live.pulse(i === 2 ? 1.4 : 1);
        } else if (lp < 0.5) pulsed[i] = false;
      });
      live.out = current >= 0 ? items[current] : null;
    };
    render(0);
    ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: '+=240%',
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => render(self.progress),
      onRefresh: (self) => render(self.progress),
      onLeave: () => (live.out = items[items.length - 1]),
      onLeaveBack: () => (live.out = null),
    });
    return () => {
      live.out = null;
      items.forEach((el, i) => {
        el.style.opacity = '';
        el.style.transform = '';
        el.classList.remove('is-cur');
        scr[i].render(1);
      });
    };
  });

  mm.add('(max-width: 1023px)', () => {
    items.forEach((el, i) => {
      scr[i].render(0);
      gsap.set(el, { opacity: 0, x: -20 });
      onReveal(
        el,
        () => {
          const st = { p: 0 };
          gsap.to(el, { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out' });
          gsap.to(st, {
            p: 1,
            duration: 0.9,
            ease: 'none',
            onUpdate: () => scr[i].render(st.p),
            onComplete: () => {
              scr[i].render(1);
              live.pulse(0.8);
            },
          });
        },
        'top 88%',
      );
    });
  });
}

/* ---------- stats ---------- */
export const statRows: HTMLElement[] = [];
export function initStats() {
  $$('[data-stat]').forEach((row) => {
    statRows.push(row);
    const val = $('[data-stat-val]', row)!;
    const s = scrambler(val, '0123456789ABCDEF#$');
    const st = { p: 0 };
    let done = false;
    s.render(0);
    gsap.to(st, {
      p: 1,
      ease: 'none',
      onUpdate: () => {
        s.render(st.p);
        if (st.p >= 0.999 && !done) {
          done = true;
          row.classList.add('is-out');
          live.pulse(1);
        } else if (st.p < 0.5 && done) {
          done = false;
          row.classList.remove('is-out');
        }
      },
      scrollTrigger: { trigger: row, start: 'top 92%', end: 'bottom 94%', scrub: 0.6 },
    });
  });
}
