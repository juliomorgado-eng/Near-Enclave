// v3B-NEAR choreography. Ciphertext goes into the enclave, only a verified result comes out —
// the copy itself. In Shift, the sentence the enclave is working on decrypts and its icon
// forms on the monolith's face; the others stay dimmed (read) or sealed (not yet reached).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { $, $$, decrypt, onReveal, rand } from '../v3/util';
import { stats } from '../../content/copy';

export const live = {
  intro: 1,
  /** element each sequence section is currently emitting (beam target), by section id */
  out: {} as Record<string, HTMLElement | null>,
  /** active sentence per sequence section (-1 = none yet) → icon on the monolith face */
  sentence: {} as Record<string, number>,
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
    yPercent: -6,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/* ---------- sequences (Shift, Format) ---------- */
export function initSequences() {
  $$('[data-seq]').forEach(initSequence);
}

function initSequence(sec: HTMLElement) {
  const id = sec.id;
  const h2 = $('[data-seq-h2]', sec);
  if (!h2) return;
  const items = $$('[data-seq-s]', sec);
  const scr = items.map((el) => scrambler($('[data-seq-t]', el)!, SCR, 0.35));
  const st = items.map(() => ({ p: 0 }));
  const tw: (gsap.core.Tween | null)[] = items.map(() => null);

  // headline enters legible: lines rise out of a mask (no character scramble)
  // autoSplit re-measures lines once fonts load / on resize, keeping the current state
  let shown = false;
  const hl = SplitText.create(h2, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'hl-line',
    autoSplit: true,
    onSplit: (self) => {
      gsap.set(self.lines, { yPercent: shown ? 0 : 105 });
    },
  });
  onReveal(
    h2,
    () => {
      shown = true;
      gsap.to(hl.lines, { yPercent: 0, duration: 1.0, ease: 'expo.out', stagger: 0.08 });
    },
    'top 85%',
  );

  let current = -2;
  const setCurrent = (i: number) => {
    if (i === current) return;
    const prev = current;
    current = i;
    live.sentence[id] = i;
    live.out[id] = i >= 0 ? items[i] : null;
    items.forEach((el, j) => {
      el.classList.toggle('is-cur', j === i);
      el.classList.toggle('is-past', j < i);
      el.classList.toggle('is-sealed', j > i);
      const to = j <= i ? 1 : 0;
      if (st[j].p === to && !tw[j]) return;
      tw[j]?.kill();
      tw[j] = gsap.to(st[j], {
        p: to,
        duration: to ? 0.9 : 0.5,
        ease: 'none',
        onUpdate: () => scr[j].render(st[j].p),
        onComplete: () => {
          scr[j].render(to);
          tw[j] = null;
        },
      });
    });
    if (i >= 0 && i > prev) live.pulse(sec.querySelector('.seq__s--prim') === items[i] ? 1.4 : 0.9);
  };
  items.forEach((_, j) => scr[j].render(0));
  setCurrent(-1);

  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    const n = items.length;
    const at = (P: number) => Math.min(n - 1, Math.floor(P * (n + 0.4)));
    ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: '+=240%',
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => setCurrent(at(self.progress)),
      onRefresh: (self) => {
        if (self.progress > 0) setCurrent(at(self.progress));
      },
      onEnter: () => setCurrent(0),
      onLeaveBack: () => setCurrent(-1),
    });
    return () => setCurrent(-1);
  });

  mm.add('(max-width: 1023px)', () => {
    const sts = items.map((el, i) =>
      ScrollTrigger.create({
        trigger: el,
        start: 'top 62%',
        onEnter: () => setCurrent(i),
        onLeaveBack: () => setCurrent(i - 1),
      }),
    );
    requestAnimationFrame(() => {
      let k = -1;
      sts.forEach((s, i) => {
        if (s.scroll() >= s.start) k = i;
      });
      if (k >= 0) setCurrent(k);
    });
    return () => setCurrent(-1);
  });
}

/* ---------- stats ---------- */
export const statRows: HTMLElement[] = [];
const fmt = (n: number, d: number) => n.toFixed(d);
export function initStats() {
  $$('[data-stat]').forEach((row, i) => {
    const s = stats[i];
    if (!s) return;
    statRows.push(row);
    const val = $('[data-stat-val]', row)!;
    const text = (a: number, b: number) => `${s.prefix}${fmt(a, s.decimals)}${s.numberTo != null ? `–${fmt(b, s.decimals)}` : ''}${s.suffix}`;
    val.textContent = text(0, 0);
    onReveal(
      row,
      () => {
        const o = { a: 0, b: 0 };
        gsap.to(o, {
          a: s.number,
          b: s.numberTo ?? 0,
          duration: 1.5,
          ease: 'power3.out',
          onUpdate: () => (val.textContent = text(o.a, o.b)),
          onComplete: () => {
            val.textContent = s.value;
            row.classList.add('is-out');
            live.pulse(1);
          },
        });
      },
      'top 96%',
    );
  });
}
