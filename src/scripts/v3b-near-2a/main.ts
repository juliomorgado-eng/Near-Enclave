// NEAR Enclave 2027 — v3B-NEAR 2A boot. Flat line language: no WebGL; every graphic is an
// SVG stroke that draws itself (stroke-dashoffset on pathLength=1), driven by GSAP + Lenis.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, onReveal, checkPendingReveals, scrollTargetY } from '../v3/util';

declare global {
  interface Window {
    __v3n2ready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = !reduce && root.classList.contains('v3n2-motion');
const WIDE = '(min-width: 1024px)';
const WIDE_PIN = '(min-width: 1024px) and (min-height: 600px)';
let lenis: Lenis | null = null;

/* ------------------------------------------------------------------ */
/* strokes: --px = one CSS pixel in each drawing's user units          */
/* ------------------------------------------------------------------ */
function initPx() {
  const svgs = $$<SVGSVGElement>('svg[data-px]');
  const fit = (svg: SVGSVGElement) => {
    const vb = svg.viewBox.baseVal;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height || !vb?.width) return;
    const sx = r.width / vb.width;
    const sy = r.height / vb.height;
    const s = svg.dataset.px === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    svg.style.setProperty('--px', (1 / s).toFixed(4));
  };
  svgs.forEach(fit);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver((es) => es.forEach((e) => fit(e.target as SVGSVGElement)));
    svgs.forEach((s) => ro.observe(s));
  }
}

/* ------------------------------------------------------------------ */
/* header follows the tone of the section underneath                   */
/* ------------------------------------------------------------------ */
function initHud() {
  const hud = $('[data-hud]');
  if (!hud) return;
  let raf = 0;
  const probe = () => {
    raf = 0;
    hud.classList.toggle('is-scrolled', window.scrollY > 24);
    const y = Math.round(hud.offsetHeight / 2);
    const hit = document.elementsFromPoint(window.innerWidth / 2, y).find((e) => !hud.contains(e));
    const host = hit?.closest<HTMLElement>('[data-tone]');
    if (host?.dataset.tone && hud.dataset.tone !== host.dataset.tone) hud.dataset.tone = host.dataset.tone;
  };
  const req = () => {
    if (!raf) raf = requestAnimationFrame(probe);
  };
  if (lenis) lenis.on('scroll', req);
  else window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req);
  ScrollTrigger.addEventListener('refresh', req);
  probe();
}

/* ------------------------------------------------------------------ */
/* headline lines rise out of a mask                                   */
/* ------------------------------------------------------------------ */
function splitReveal(el: HTMLElement, start = 'top 85%') {
  let shown = false;
  const st = SplitText.create(el, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'hl-line',
    autoSplit: true,
    onSplit: (self) => {
      gsap.set(self.lines, { yPercent: shown ? 0 : 105 });
    },
  });
  onReveal(
    el,
    () => {
      shown = true;
      gsap.to(st.lines, { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: 0.08 });
    },
    start,
  );
}

const draw = (els: Element[] | Element | null, vars: gsap.TweenVars = {}) =>
  gsap.to(els, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut', ...vars });

/* ------------------------------------------------------------------ */
/* hero: the enclave draws itself, then the packets run                */
/* ------------------------------------------------------------------ */
let enclInView = true;
let enclCovered = false;
function syncEncl() {
  $('[data-encl]')?.classList.toggle('is-paused', !enclInView || enclCovered);
}

function initHero() {
  const svg = $<SVGSVGElement>('[data-encl]');
  const tl = gsap.timeline({ delay: 0.12 });
  tl.to('[data-hero-line]', { y: 0, yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.08 }, 0);
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07, clearProps: 'transform' }, 0.1);
  if (svg) {
    const q = (s: string) => $$(s, svg);
    tl.add(draw(q('.encl__slab'), { duration: 1.4 }), 0.25)
      .add(draw(q('.encl__inner'), { duration: 1.2 }), 0.5)
      .to(q('.encl__grid, .encl__axis'), { opacity: 1, duration: 0.9, ease: 'none' }, 0.95)
      .add(draw(q('.encl__ground, .encl__dim'), { stagger: 0.12 }), 0.7)
      .to(q('.encl__hatch'), { opacity: 1, duration: 0.6, ease: 'none' }, 1.3)
      .add(draw(q('.encl__wire'), { duration: 1.1, stagger: 0.06 }), 0.85)
      .to(q('.encl__in [data-pop]'), { opacity: 1, duration: 0.25, stagger: 0.06 }, 1.55)
      .add(draw(q('.encl__out'), { duration: 1.0, ease: 'power3.inOut' }), 2.0)
      .to(q('.encl__node--out'), { opacity: 1, duration: 0.3 }, 2.0)
      .add(() => svg.classList.add('is-live'), 2.3);

    const io = new IntersectionObserver((es) => {
      enclInView = es[0].isIntersecting;
      syncEncl();
    });
    io.observe(svg);
  }

  // the light Shift panel rises over the sticky hero: the hero sinks and dims under it
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px) and (min-height: 620px)', () => {
    const shift = $('[data-shift]');
    if (!shift) return;
    const tw = gsap.timeline({
      scrollTrigger: {
        trigger: shift,
        start: 'top bottom',
        end: 'top top',
        scrub: true,
        onLeave: () => {
          enclCovered = true;
          syncEncl();
        },
        onEnterBack: () => {
          enclCovered = false;
          syncEncl();
        },
      },
    });
    tw.to('[data-hero-shade]', { opacity: 0.55, ease: 'none' }, 0).to('[data-hero-copy], .hero__stage', { yPercent: -7, scale: 0.97, ease: 'none' }, 0);
    return () => {
      enclCovered = false;
      syncEncl();
    };
  });
}

/* ------------------------------------------------------------------ */
/* shift: one icon per sentence, drawn on its keyline plate            */
/* ------------------------------------------------------------------ */
function initShift() {
  const sec = $('[data-shift]');
  if (!sec) return;
  const items = $$('[data-s]', sec);
  const icos = $$<SVGGElement>('[data-ico]', sec);
  const prog = $$('[data-prog]', sec);
  const plate = $<SVGSVGElement>('[data-plate]', sec);
  const h2 = $('[data-split]', sec);
  if (h2) splitReveal(h2);

  sec.classList.add('is-seq');
  icos.forEach((g) => gsap.set($$('path', g), { strokeDasharray: '1 2', strokeDashoffset: 1 }));

  if (plate) {
    onReveal(
      plate,
      () => {
        const q = (s: string) => $$(s, plate);
        draw(q('.plate__frame'), { duration: 1.3 });
        draw(q('.plate__major'), { duration: 1.4, stagger: 0.12, delay: 0.2 });
        gsap.to(q('.plate__grid, .plate__ruler'), { opacity: 1, duration: 1.2, delay: 0.35, ease: 'none' });
      },
      'top 85%',
    );
  }

  let cur = -2;
  const set = (i: number) => {
    if (i === cur) return;
    cur = i;
    items.forEach((el, j) => {
      el.classList.toggle('is-cur', j === i);
      el.classList.toggle('is-past', j < i);
    });
    prog.forEach((p, j) => p.classList.toggle('is-on', j <= i));
    icos.forEach((g, j) => {
      const paths = $$('path', g);
      g.classList.toggle('is-cur', j === i);
      if (j === i) {
        gsap.killTweensOf(paths);
        g.dataset.on = '1';
        gsap.fromTo(paths, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.12, delay: 0.2 });
      } else if (g.dataset.on) {
        delete g.dataset.on;
        gsap.killTweensOf(paths);
        // the old icon runs off the end of its own strokes
        gsap.to(paths, { strokeDashoffset: -2, duration: 0.8, ease: 'power2.in', stagger: 0.03 });
      }
    });
  };
  set(-1);

  const n = items.length;
  const mm = gsap.matchMedia();
  mm.add(WIDE, () => {
    const at = (p: number) => Math.min(n - 1, Math.floor(p * n * 1.08));
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 40%',
      end: 'top top',
      onEnter: () => cur < 0 && set(0),
      onLeaveBack: () => set(-1),
    });
    ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: '+=260%',
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => set(at(self.progress)),
      onRefresh: (self) => {
        if (self.progress > 0) set(at(self.progress));
      },
    });
    return () => set(-1);
  });
  mm.add('(max-width: 1023px)', () => {
    const sts = items.map((el, i) =>
      ScrollTrigger.create({
        trigger: el,
        start: 'top 62%',
        onEnter: () => set(i),
        onLeaveBack: () => set(i - 1),
      }),
    );
    requestAnimationFrame(() => {
      let k = -1;
      sts.forEach((s, i) => {
        if (s.scroll() >= s.start) k = i;
      });
      if (k >= 0) set(k);
    });
    return () => set(-1);
  });
}

/* ------------------------------------------------------------------ */
/* stats: count up; on wide screens they travel along the ruler        */
/* ------------------------------------------------------------------ */
function initStats() {
  const sec = $('[data-stats]');
  if (!sec) return;
  const rows = $$('[data-st]', sec);
  const done = new Set<number>();
  const fmt = (v: number, d: number) => v.toFixed(d);
  const text = (row: HTMLElement, a: number, b: number) => {
    const { pre = '', suf = '', n2 = '', d = '0' } = row.dataset;
    return `${pre}${fmt(a, +d)}${n2 ? `–${fmt(b, +d)}` : ''}${suf}`;
  };
  rows.forEach((row) => {
    const v = $('[data-val]', row);
    if (v) v.textContent = text(row, 0, 0);
  });
  const count = (i: number) => {
    const row = rows[i];
    if (!row || done.has(i)) return;
    done.add(i);
    const v = $('[data-val]', row)!;
    const final = v.textContent && row.querySelector('.sr-only')?.textContent;
    const o = { a: 0, b: 0 };
    gsap.to(o, {
      a: +row.dataset.n!,
      b: +(row.dataset.n2 || 0),
      duration: 1.6,
      ease: 'power3.out',
      onUpdate: () => (v.textContent = text(row, o.a, o.b)),
      onComplete: () => {
        if (final) v.textContent = final;
      },
    });
  };

  const mm = gsap.matchMedia();
  mm.add(WIDE_PIN, () => {
    const track = $('[data-track]', sec)!;
    const fill = $('[data-fill]', sec);
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    // counting starts just before the section is seen, for every figure already on screen
    const visible = (lim: number) =>
      rows.forEach((r, k) => {
        if (!done.has(k) && r.getBoundingClientRect().left < lim) count(k);
      });
    onReveal(sec, () => visible(window.innerWidth), 'top 55%');
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: () => `+=${dist()}`,
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: () => visible(window.innerWidth * 0.92),
      },
    });
    tl.to(track, { x: () => -dist(), ease: 'none' }, 0);
    if (fill) tl.fromTo(fill, { scaleX: 0.02 }, { scaleX: 1, ease: 'none' }, 0);
  });
  mm.add(`not all and ${WIDE_PIN}`, () => {
    rows.forEach((row, i) =>
      onReveal(
        row,
        () => {
          gsap.to($('[data-st-rule]', row), { scaleX: 1, duration: 1.2, ease: 'expo.inOut' });
          count(i);
        },
        'top 85%',
      ),
    );
  });
}

/* ------------------------------------------------------------------ */
/* band: the hairlines grow down from the dark edge                    */
/* ------------------------------------------------------------------ */
function initBand() {
  const band = $('[data-band]');
  if (!band) return;
  const lines = $$('line', band);
  gsap.fromTo(
    lines,
    { scaleY: 0 },
    {
      scaleY: 1,
      ease: 'none',
      stagger: { each: 0.004, from: 'random' },
      scrollTrigger: { trigger: band, start: 'top bottom', end: 'bottom 45%', scrub: 0.5 },
    },
  );
}

/* ------------------------------------------------------------------ */
/* format: the plan traces outward from the stage with the scroll      */
/* ------------------------------------------------------------------ */
function initFormat() {
  const sec = $('[data-format]');
  if (!sec) return;
  const h2 = $('[data-split]', sec);
  if (h2) splitReveal(h2);
  const plan = $<SVGSVGElement>('[data-plan]', sec);
  if (plan) {
    const q = (s: string) => $$(s, plan);
    const build = () => {
      const tl = gsap.timeline({ defaults: { ease: 'none' } });
      tl.to(q('.plan__stage'), { strokeDashoffset: 0, duration: 1 }, 0)
        .to(q('.plan__spk'), { opacity: 1, duration: 0.3 }, 0.6)
        .to(q('.plan__dim'), { strokeDashoffset: 0, duration: 0.8 }, 0.5);
      $$('.plan__row', plan).forEach((row, i) => {
        tl.to($$('.plan__arc', row), { strokeDashoffset: 0, duration: 0.9 }, 0.8 + i * 0.32);
        tl.to($$('.plan__seats', row), { opacity: 1, duration: 0.5 }, 1.3 + i * 0.32);
      });
      tl.to(q('.plan__aisle'), { strokeDashoffset: 0, duration: 1.2 }, 1.6)
        .to(q('.plan__wall'), { strokeDashoffset: 0, duration: 1.4 }, 3.0)
        .to(q('.plan__axis'), { opacity: 1, duration: 0.8 }, 3.4);
      return tl;
    };
    const mm = gsap.matchMedia();
    mm.add(WIDE, () => {
      const tl = build();
      ScrollTrigger.create({ animation: tl, trigger: sec, start: 'top 55%', end: 'bottom 85%', scrub: 0.6 });
    });
    mm.add('(max-width: 1023px)', () => {
      const tl = build();
      ScrollTrigger.create({ animation: tl, trigger: plan, start: 'top 85%', end: 'bottom 40%', scrub: 0.6 });
    });
  }
  $$('[data-fl]', sec).forEach((li) =>
    onReveal(
      li,
      () => {
        gsap.to($('[data-fl-rule]', li), { scaleX: 1, duration: 1.1, ease: 'expo.inOut' });
        gsap.fromTo($$('.fl__ico, .fl__t', li), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.15, clearProps: 'transform' });
      },
      'top 88%',
    ),
  );
}

/* ------------------------------------------------------------------ */
/* footer: the event name traces in outline                            */
/* ------------------------------------------------------------------ */
function initFooter() {
  const mark = $('.foot__mark');
  const text = mark?.querySelector('text');
  if (!mark || !text) return;
  onReveal(
    mark,
    () => {
      gsap.to(text, {
        strokeDashoffset: 0,
        duration: 2.6,
        ease: 'power2.inOut',
        onComplete: () => mark.classList.add('is-drawn'),
      });
    },
    'top 92%',
  );
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();
  initPx();

  if (motion) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.addEventListener('request:open', () => lenis?.stop());
    window.addEventListener('request:close', () => lenis?.start());
  }

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      const target = hash.length > 1 ? $(hash) : null;
      if (!target) return;
      if (lenis) {
        e.preventDefault();
        lenis.scrollTo(hash === '#top' ? 0 : scrollTargetY(target), { duration: 1.4 });
        history.replaceState(null, '', hash);
      }
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  if (motion) {
    for (const fn of [initHero, initShift, initStats, initBand, initFormat, initFooter]) {
      try {
        fn();
      } catch (err) {
        console.info('[v3b-near-2a] section motion skipped:', err);
      }
    }
  }
  initHud();

  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  document.fonts?.ready.then(start);
  window.addEventListener('load', start, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v3n2-motion');
  console.info('[v3b-near-2a] boot failed, static page shown.', err);
}
window.__v3n2ready = true;
