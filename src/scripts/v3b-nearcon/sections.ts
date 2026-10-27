// v3B-NEARCON choreography. Ciphertext goes into the enclave, a clean result comes
// out. In this version the Shift reads as ONE paragraph and the enclave reacts to the
// whole section's scroll progress (live.order), never sentence by sentence.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { $, $$, onReveal, clamp, smooth } from '../v3/util';

export const live = {
  intro: 1,
  /** element the enclave is currently emitting (beam target) */
  out: null as HTMLElement | null,
  /** 0 → raw ciphertext stream, 1 → ordered / decrypted stream */
  order: 0,
  /** 0 → many lanes, 1 → a single line ("one stage") */
  stage: 0,
  pulse: (_v?: number) => {},
};

/* ---------- reveals ---------- */
export function initReveals() {
  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'transform' }), 'top 92%'),
  );
}

/* ---------- hero ---------- */
export function heroReveal(tl: gsap.core.Timeline, at: number) {
  const lines = $$('[data-hero-line]');
  tl.to(lines, { y: 0, yPercent: 0, duration: 1.0, ease: 'expo.out', stagger: 0.08 }, at);
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 }, at + 0.1);
  tl.fromTo('[data-hero-cta]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, at + 0.3);
  tl.fromTo(live, { intro: 0 }, { intro: 1, duration: 1.2, ease: 'expo.out' }, at - 0.2);
}

export function initHero() {
  gsap.to('.hero__copy', {
    yPercent: -6,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/* ---------- copy sections (Shift, Format) ---------- */
// H2 and paragraph enter legible (masked lines, no character scramble). The enclave's
// reaction is driven by the whole section's progress, never sentence by sentence.
function pinnedCopy(
  sec: HTMLElement,
  h2: HTMLElement,
  para: HTMLElement,
  react: (P: number) => void,
) {
  let pLines: HTMLElement[] = [];
  let lastP = 0;
  let pulsed = false;
  const paint = (P: number) => {
    lastP = P;
    const n = pLines.length || 1;
    pLines.forEach((l, i) => {
      const t = clamp((P - (i / n) * 0.36) / 0.16);
      const e = 1 - Math.pow(1 - t, 3);
      l.style.transform = `translate3d(0,${(1 - e) * 105}%,0)`;
    });
    react(P);
    if (P >= 0.55 && !pulsed) {
      pulsed = true;
      live.pulse(1.2);
    } else if (P < 0.3) pulsed = false;
  };
  SplitText.create(h2, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'ln',
    autoSplit: true,
    onSplit: (self) =>
      gsap.from(self.lines, {
        yPercent: 105,
        duration: 1,
        ease: 'expo.out',
        stagger: 0.08,
        scrollTrigger: { trigger: h2, start: 'top 92%', toggleActions: 'play none none reverse' },
      }),
  });
  SplitText.create(para, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'ln',
    autoSplit: true,
    onSplit: (self) => {
      pLines = self.lines as HTMLElement[];
      paint(lastP);
    },
  });

  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 30%',
      end: () => `+=${window.innerHeight * 0.3 + window.innerHeight * 0.9}`,
      onUpdate: (self) => paint(self.progress),
      onRefresh: (self) => paint(self.progress),
    });
    ScrollTrigger.create({ trigger: sec, start: 'top top', end: '+=90%', pin: true, anticipatePin: 1 });
  });
  mm.add('(max-width: 1023px)', () => {
    ScrollTrigger.create({
      trigger: para,
      start: 'top 92%',
      end: 'bottom 50%',
      onUpdate: (self) => paint(self.progress),
      onRefresh: (self) => paint(self.progress),
      onLeave: () => paint(1),
    });
  });
}

export function initShift() {
  const sec = $('#shift');
  const h2 = $('[data-shift-h2]');
  const para = $('[data-shift-p]');
  if (!sec || !h2 || !para) return;
  pinnedCopy(sec, h2, para, (P) => {
    live.order = smooth(0.02, 0.62, P);
    live.out = P > 0.02 ? para : null;
  });
}

export function initFormat() {
  const sec = $('#format');
  const h2 = $('[data-format-h2]');
  const para = $('[data-format-p]');
  if (!sec || !h2 || !para) return;
  pinnedCopy(sec, h2, para, (P) => {
    live.stage = smooth(0.05, 0.7, P);
  });
}

/* ---------- stats: count-up from the doc's numeric parts ---------- */
function fmt(v: number, d: number) {
  return v.toFixed(d);
}
export function initStats() {
  const vals = $$('[data-stat-val]');
  const grid = $('[data-stats-grid]');
  if (!grid) return;
  vals.forEach((el) => {
    const prefix = el.dataset.prefix ?? '';
    const suffix = el.dataset.suffix ?? '';
    const n = el.dataset.number ? Number(el.dataset.number) : 0;
    const to = el.dataset.numberTo ? Number(el.dataset.numberTo) : null;
    const d = Number(el.dataset.decimals ?? 0);
    const paint = (k: number) => {
      el.textContent = to == null ? `${prefix}${fmt(n * k, d)}${suffix}` : `${prefix}${fmt(n * k, d)}–${fmt(to * k, d)}${suffix}`;
    };
    paint(0);
    el.dataset.state = 'pending';
  });
  const start = window.innerWidth >= 1024 ? 'top 82%' : 'top 90%';
  vals.forEach((el, i) => {
    const row = el.closest<HTMLElement>('[data-stat]')!;
    onReveal(
      row,
      () => {
        const prefix = el.dataset.prefix ?? '';
        const suffix = el.dataset.suffix ?? '';
        const n = Number(el.dataset.number);
        const to = el.dataset.numberTo ? Number(el.dataset.numberTo) : null;
        const d = Number(el.dataset.decimals ?? 0);
        const st = { k: 0 };
        const wide = window.innerWidth >= 1024;
        gsap.to(st, {
          k: 1,
          duration: 1.4,
          delay: wide ? i * 0.12 : 0,
          ease: 'expo.out',
          onUpdate: () => {
            el.textContent = to == null ? `${prefix}${fmt(n * st.k, d)}${suffix}` : `${prefix}${fmt(n * st.k, d)}–${fmt(to * st.k, d)}${suffix}`;
          },
          onComplete: () => {
            el.textContent = el.dataset.final ?? el.textContent;
            el.dataset.state = 'done';
            live.pulse(0.7);
          },
        });
      },
      start,
    );
  });
}
