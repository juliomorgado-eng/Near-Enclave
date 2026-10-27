// NEAR Enclave 2027 — v3D "Invitation" boot.
// One object, one job: the glass invitation keycard. Hero = the invitation; Shift = its back is
// filled in as the argument is read (holder redacted, access verified); Stats = the card is
// inserted into a reader and the figures unlock as data it authorises.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, smooth, lerp, clamp, onReveal, checkPendingReveals, scrollTargetY } from '../v3/util';
import { createScene, CW, CH, type Scene } from './scene';

declare global {
  interface Window {
    __v3dready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const root = document.documentElement;
const AR = CW / CH;
const TAU = Math.PI * 2;
let lenis: Lenis | null = null;
let scene: Scene | null = null;
const desktopMQ = matchMedia('(min-width: 1024px) and (min-height: 640px)');

const live = {
  intro: reduceMotion ? 1 : 0,
  hover: 0,
  hoverT: 0,
  sweep: -1,
  shiftP: 0,
  statsP: 0,
  theme: 0,
  px: 0,
  py: 0,
  pxT: 0,
  pyT: 0,
};

/* ------------------------------------------------------------------ */
/* Card placement from DOM anchors                                     */
/* ------------------------------------------------------------------ */
type Place = { x: number; y: number; s: number; c: number; long: number };
function place(el: HTMLElement | null, portrait: boolean): Place {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (!el) return { x: 0, y: 0, s: 0.3, c: 0.5, long: 0 };
  const r = el.getBoundingClientRect();
  let short = portrait ? Math.min(r.width, r.height / AR) : Math.min(r.height, r.width / AR);
  short *= portrait ? 0.98 : 0.9;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return { x: (cx / W) * 2 - 1, y: 1 - (cy / H) * 2, s: short / H, c: cy / H, long: short * AR };
}

const anchors = {
  hero: $('[data-anchor="hero"]'),
  shift: $('[data-anchor="shift"]'),
  stats: $('[data-anchor="stats"]'),
};
const secs = { shift: $('#shift'), stats: $('#stats') };
const heroSub = $('.hero__sub');
const proof = $('[data-shift-proof]');
const HD = 64;
// rows start once the card has landed (~17 % into the pin)
const shiftStep = (p: number) => clamp((p - 0.17) * 5.0, 0, 4);

let time = 0;
function poseCard(dt: number) {
  if (!scene) return;
  time += dt;
  const H = window.innerHeight;
  const k = 1 - Math.exp(-dt * 6);
  live.hover += (live.hoverT - live.hover) * (1 - Math.exp(-dt * 8));
  live.px += (live.pxT - live.px) * k * 0.5;
  live.py += (live.pyT - live.py) * k * 0.5;
  const hv = live.hover;
  const ph = place(anchors.hero, false);
  const ps = place(anchors.shift, false);
  const pt = place(anchors.stats, true);
  const sway = Math.sin(time * 0.32) * 0.3 * (1 - hv);
  const p = scene.pose;
  let step = 4;
  let ins = 0;
  let tS: number;
  let tT: number;
  let opacity = 1;
  let ryShift = Math.PI + Math.sin(time * 0.28) * 0.07;
  let ryStats = TAU;
  let base: Place;
  if (desktopMQ.matches) {
    // the flight to the Shift starts once the subhead has left the screen; it swings out to the
    // right first (clear of the centred CTA) and then settles into the Shift column
    const gone = HD - (heroSub?.getBoundingClientRect().bottom ?? 0);
    tS = smooth(0, H * 0.42, gone);
    const tx = smooth(0, 0.3, tS);
    tT = smooth(0.9, 0.04, (secs.stats?.getBoundingClientRect().top ?? H) / H);
    base = {
      x: lerp(lerp(ph.x, ps.x, tx), pt.x, tT),
      y: lerp(lerp(ph.y, ps.y, tS), pt.y, tT),
      s: lerp(lerp(ph.s, ps.s, tS), pt.s, tT),
      c: 0.5,
      long: pt.long,
    };
    step = shiftStep(live.shiftP);
    ins = smooth(0.02, 0.2, live.statsP) * tT;
  } else {
    // flow layout: the card rides with whichever anchor is nearest the middle of the screen
    const ds = [ph, ps, pt].map((q) => Math.abs(q.c - 0.5));
    const i = ds[0] <= ds[1] && ds[0] <= ds[2] ? 0 : ds[1] <= ds[2] ? 1 : 2;
    base = [ph, ps, pt][i];
    tS = i >= 1 ? 1 : 0;
    tT = i === 2 ? 1 : 0;
    opacity = 1 - smooth(0.42, 0.6, ds[i]);
    if (i === 1) {
      ryShift = Math.PI * smooth(1.0, 0.6, ps.c) + Math.sin(time * 0.28) * 0.06;
      step = clamp(4.2 * smooth(0.82, 0.22, ps.c), 0, 4);
    }
    if (i === 2) {
      ryStats = lerp(Math.PI, TAU, smooth(1.05, 0.72, pt.c));
      ins = smooth(0.72, 0.42, pt.c);
    }
    if (i === 0) step = 0;
  }
  const ryHero = sway + live.px * 0.18;
  p.x = base.x;
  p.y = base.y - (((ins * base.long * 0.58) / H) * 2) + hv * 0.012 * (1 - tS);
  // mid-flight the card turns edge-on and recedes, so it slips past the copy
  const travel = desktopMQ.matches ? Math.sin(Math.PI * tS) * (1 - tT) + Math.sin(Math.PI * tT) : 0;
  p.s = base.s * (1 + hv * 0.035 * (1 - tT)) * lerp(0.86, 1, live.intro) * (1 - 0.22 * travel);
  p.ry = lerp(lerp(ryHero, ryShift, tS), ryStats, tT) + (1 - live.intro) * -0.8;
  p.rx = (live.py * 0.12 + Math.sin(time * 0.23) * 0.04 - hv * 0.05) * (1 - tT);
  p.rz = lerp(lerp(-0.035, 0.03, tS), -Math.PI / 2, tT);
  p.opacity = opacity * live.intro;
  p.shadow = 1 - tT;
  proof?.classList.toggle('is-gone', tT > 0.01 || (desktopMQ.matches && tS < 0.98));
  scene.setStep(step);
  // idle sweep every ~9 s; the CTA hover drives its own
  const idle = (time % 9) / 3.2;
  scene.setHover(hv, live.sweep >= 0 ? live.sweep : idle);
  if (slot && body) {
    const sr = slot.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    scene.setClip(br.left, br.right, sr.top + sr.height / 2, tT > 0.5);
  }
  syncReader(ins);
}
const slot = $('[data-slot]');
const body = $('.reader__body');

/* ------------------------------------------------------------------ */
/* Shift + Stats                                                       */
/* ------------------------------------------------------------------ */
const sentences = $$('[data-shift-s]');
let activeS = -1;
function setSentence(i: number) {
  if (i === activeS) return;
  activeS = i;
  sentences.forEach((s, j) => {
    s.classList.toggle('is-on', j === i);
    s.classList.toggle('is-past', j < i);
  });
  $('[data-shift-proof]')?.classList.toggle('is-on', i >= 2);
}

const statusEl = $('[data-reader-status]');
const countEl = $('[data-reader-count]');
const reader = $('[data-reader]');
let readerState = '';
let authCount = 0;
function syncReader(ins: number) {
  const st = ins < 0.04 ? 'Awaiting credential' : ins < 0.97 ? 'Reading credential' : 'Credential accepted';
  if (st === readerState) return;
  readerState = st;
  if (statusEl) statusEl.textContent = st;
  reader?.classList.toggle('is-reading', ins >= 0.04 && ins < 0.97);
  reader?.classList.toggle('is-ok', ins >= 0.97);
  if (ins >= 0.97 && !desktopMQ.matches) {
    // flow layout: unlock what is already in view
    checkPendingReveals();
  }
}

const stats = $$('[data-stat]');
function authorize(row: HTMLElement) {
  if (row.classList.contains('is-auth')) return;
  row.classList.add('is-auth');
  authCount++;
  if (countEl) countEl.textContent = String(authCount);
  const v = $('[data-stat-val]', row);
  if (v && !reduceMotion) {
    const final = v.dataset.final ?? v.textContent ?? '';
    gsap.to(v, { duration: 0.9, ease: 'none', scrambleText: { text: final, chars: '░▒▓', speed: 0.6, revealDelay: 0.25 } });
  }
}

function initShift(mm: gsap.MatchMedia) {
  mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
    const st = ScrollTrigger.create({
      trigger: '#shift',
      start: 'top top',
      end: '+=190%',
      pin: true,
      onUpdate: (self) => {
        live.shiftP = self.progress;
        setSentence(Math.min(3, Math.floor(Math.min(3.99, shiftStep(self.progress)))));
      },
    });
    live.shiftP = st.progress;
    setSentence(Math.min(3, Math.floor(Math.min(3.99, shiftStep(st.progress)))));
    return () => {
      live.shiftP = 0;
    };
  });
  mm.add('not ((min-width: 1024px) and (min-height: 640px))', () => {
    const sts = sentences.map((s, i) =>
      ScrollTrigger.create({
        trigger: s,
        start: 'top 72%',
        end: 'bottom 30%',
        onToggle: (self) => {
          if (self.isActive) setSentence(i);
        },
      }),
    );
    return () => sts.forEach((s) => s.kill());
  });
}

function initStats(mm: gsap.MatchMedia) {
  const TH = [0.3, 0.43, 0.56, 0.69];
  const cta = $('[data-stats-cta]');
  mm.add('(min-width: 1024px) and (min-height: 640px)', () => {
    const run = (p: number) => {
      live.statsP = p;
      stats.forEach((r, i) => {
        if (p >= TH[i]) authorize(r);
      });
      if (p >= 0.78) cta?.classList.add('is-in');
    };
    const st = ScrollTrigger.create({
      trigger: '#stats',
      start: 'top top',
      end: '+=200%',
      pin: true,
      onUpdate: (self) => run(self.progress),
    });
    run(st.progress);
  });
  mm.add('not ((min-width: 1024px) and (min-height: 640px))', () => {
    stats.forEach((r) => onReveal(r, () => authorize(r), 'top 78%'));
    if (cta) onReveal(cta, () => cta.classList.add('is-in'), 'top 90%');
  });
}

/* ------------------------------------------------------------------ */
/* Reveals                                                             */
/* ------------------------------------------------------------------ */
function initReveals() {
  $$('[data-lines]').forEach((el) =>
    onReveal(
      el,
      () => {
        gsap.set(el, { visibility: 'visible' });
        const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
        gsap.from(split.lines, {
          yPercent: 108,
          duration: 1.1,
          ease: 'expo.out',
          stagger: 0.07,
          onComplete: () => split.revert(),
        });
      },
      'top 85%',
    ),
  );
  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'transform' }), 'top 90%'),
  );
}

function heroReveal(tl: gsap.core.Timeline, at: number) {
  tl.to(live, { intro: 1, duration: 1.4, ease: 'expo.out' }, at);
  tl.to('[data-hero-line]', { y: 0, yPercent: 0, opacity: 1, duration: 1.0, ease: 'expo.out', stagger: 0.07 }, at + 0.08);
  tl.to('[data-hero-fade]', { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07 }, at + 0.25);
}

/* ------------------------------------------------------------------ */
/* Intro (~1 s, ≤0.4 s on repeat visits)                              */
/* ------------------------------------------------------------------ */
function runIntro(ready: Promise<unknown>): Promise<void> {
  const loader = $('[data-loader]');
  const short = root.classList.contains('v3d-intro-short');
  const finish = () => {
    loader?.remove();
    root.classList.remove('v3d-intro-long', 'v3d-intro-short');
    try {
      sessionStorage.setItem('v3d-intro', '1');
    } catch {
      /* private mode */
    }
  };
  const tl = gsap.timeline();
  if (!loader) {
    heroReveal(tl, 0);
    finish();
    return Promise.resolve();
  }
  const no = $('[data-ld-no]', loader);
  const edge = $('[data-ld-edge]', loader);
  const C = short ? 0.14 : 0.55;
  return new Promise((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      finish();
      resolve();
    };
    const gate = Promise.race([ready.catch(() => 0), new Promise((r) => setTimeout(r, short ? 120 : 380))]);
    const n = { v: 0 };
    tl.to(n, {
      v: 1193,
      duration: C,
      ease: 'power2.out',
      onUpdate: () => {
        if (no) no.textContent = `0427·${String(Math.round(n.v)).padStart(4, '0')}`;
      },
    });
    if (edge) tl.fromTo(edge, { scaleX: 0 }, { scaleX: 1, duration: C, ease: 'power2.inOut' }, 0);
    tl.addPause(C, () => {
      gate.then(() => tl.resume());
    });
    const out = C + 0.02;
    const OD = short ? 0.24 : 0.4;
    tl.to(loader, { opacity: 0, duration: OD, ease: 'power2.out' }, out);
    tl.to($('.ld__card', loader), { y: -18, scale: 0.97, duration: OD, ease: 'power2.out' }, out);
    tl.add(() => lenis?.start(), out);
    heroReveal(tl, out + 0.02);
    tl.add(end, out + OD);
    setTimeout(end, 3000);
  });
}

/* ------------------------------------------------------------------ */
/* Header, menu, anchors                                               */
/* ------------------------------------------------------------------ */
function scrollToHash(hash: string) {
  const target = hash.length > 1 ? $(hash) : null;
  if (!target && hash !== '#top') return false;
  const y = hash === '#top' || !target ? 0 : scrollTargetY(target);
  if (lenis) lenis.scrollTo(y, { duration: 1.3 });
  else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  history.replaceState(null, '', hash);
  if (target) {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  return true;
}

function initMenu() {
  const menu = $('[data-menu]');
  const openBtn = $('[data-menu-open]');
  if (!menu || !openBtn) return;
  let last: HTMLElement | null = null;
  const open = () => {
    last = document.activeElement as HTMLElement | null;
    menu.hidden = false;
    requestAnimationFrame(() => menu.setAttribute('data-open', ''));
    openBtn.setAttribute('aria-expanded', 'true');
    root.classList.add('menu-open');
    lenis?.stop();
    setTimeout(() => $('[data-menu-link]', menu)?.focus({ preventScroll: true }), 60);
  };
  const close = (restore = true) => {
    if (menu.hidden) return;
    menu.removeAttribute('data-open');
    openBtn.setAttribute('aria-expanded', 'false');
    root.classList.remove('menu-open');
    lenis?.start();
    setTimeout(() => (menu.hidden = true), reduceMotion ? 0 : 420);
    if (restore) last?.focus({ preventScroll: true });
  };
  openBtn.addEventListener('click', open);
  $$('[data-menu-close]', menu).forEach((b) => b.addEventListener('click', () => close()));
  $$('[data-menu-close-silent]', menu).forEach((b) => b.addEventListener('click', () => close(false)));
  $$<HTMLAnchorElement>('[data-menu-link]', menu).forEach((a) =>
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      close(false);
      setTimeout(() => scrollToHash(href), 80);
    }),
  );
  document.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const items = $$<HTMLElement>('a[href], button', menu);
      const first = items[0];
      const lastI = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastI.focus();
      } else if (!e.shiftKey && document.activeElement === lastI) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

function initHover() {
  const on = () => {
    live.hoverT = 1;
    gsap.fromTo(live, { sweep: -0.05 }, { sweep: 1.05, duration: 1.1, ease: 'power2.inOut', overwrite: true, onComplete: () => void (live.sweep = -1) });
    root.classList.add('card-hover');
  };
  const off = () => {
    live.hoverT = 0;
    root.classList.remove('card-hover');
  };
  $$('[data-card-hover]').forEach((el) => {
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
  });
  // the header CTA wakes the card too
  $$('.hd [data-open-request]').forEach((el) => {
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
  });
}

function syncTheme(dt: number) {
  const mid = window.innerHeight * 0.5;
  let theme = 'paper';
  for (const s of $$('[data-chapter]')) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) {
      theme = s.dataset.theme || 'paper';
      break;
    }
  }
  if (document.body.dataset.theme !== theme) document.body.dataset.theme = theme;
  const t = theme === 'ink' ? 1 : 0;
  live.theme += (t - live.theme) * (dt > 0 ? 1 - Math.exp(-dt * 4) : 1);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function unlock() {
  $('[data-loader]')?.remove();
  root.classList.remove('v3d-intro-long', 'v3d-intro-short');
  lenis?.start();
}

function boot() {
  (window as unknown as { __v3dBoot: number }).__v3dBoot = performance.now();
  initRequestModal();
  initMenu();

  const canvas = $<HTMLCanvasElement>('[data-gl]');
  const fg = $<HTMLCanvasElement>('[data-gl-fg]');
  const lowTier = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  if (canvas && fg && !reduceMotion) {
    try {
      scene = createScene(canvas, fg, { lowTier });
    } catch (err) {
      scene = null;
      console.info('[v3d] WebGL unavailable, using CSS card.', err);
    }
  }
  root.classList.add(scene ? 'gl-on' : 'no-gl');

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.09, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
  }

  window.addEventListener('request:open', () => {
    lenis?.stop();
    scene?.pause(true);
  });
  window.addEventListener('request:close', () => {
    lenis?.start();
    scene?.pause(false);
  });

  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    if (a.hasAttribute('data-menu-link') || a.classList.contains('skip')) return;
    a.addEventListener('click', (e) => {
      if (scrollToHash(a.getAttribute('href') || '')) e.preventDefault();
    });
  });

  if (finePointer) {
    window.addEventListener(
      'pointermove',
      (e) => {
        live.pxT = (e.clientX / window.innerWidth) * 2 - 1;
        live.pyT = (e.clientY / window.innerHeight) * 2 - 1;
        scene?.setPointer(e.clientX, e.clientY);
      },
      { passive: true },
    );
  }

  const mm = gsap.matchMedia();
  let motionOk = true;
  if (!reduceMotion) {
    for (const fn of [() => initShift(mm), () => initStats(mm), initReveals, initHover]) {
      try {
        fn();
      } catch (err) {
        motionOk = false;
        console.info('[v3d] motion skipped:', err);
      }
    }
  }
  if (!motionOk || reduceMotion) {
    root.classList.remove('v3d-motion');
    stats.forEach((r) => r.classList.add('is-auth'));
    authCount = stats.length;
    if (countEl) countEl.textContent = String(authCount);
    setSentence(3);
    $('[data-stats-cta]')?.classList.add('is-in');
    reader?.classList.add('is-ok');
    if (statusEl) statusEl.textContent = 'Credential accepted';
    live.intro = 1;
  }

  syncTheme(0);
  gsap.ticker.add((_t, dms) => {
    const dt = Math.min(dms / 1000, 1 / 20);
    syncTheme(dt);
    if (!scene && root.classList.contains('v3d-motion')) {
      // CSS card: the reader still follows the scroll
      syncReader(desktopMQ.matches ? smooth(0.02, 0.2, live.statsP) : smooth(0.72, 0.42, place(anchors.stats, true).c));
    }
    if (scene) {
      poseCard(dt);
      scene.setTheme(live.theme);
      scene.tick(dt);
    }
  });
  if (scene) {
    const sc = scene;
    document.addEventListener('visibilitychange', () => sc.pause(document.hidden));
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) sc.dispose();
    });
  }

  // canvas faces need the real fonts: load them explicitly, then repaint
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('500 32px "JetBrains Mono Variable"'),
        document.fonts.load('600 30px "Archivo Variable"'),
        document.fonts.ready,
      ])
    : Promise.resolve();
  const ready = fonts.then(() => {
    scene?.refreshTextures();
    scene?.compile();
  });

  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  if (reduceMotion || !motionOk) {
    unlock();
    start();
  } else {
    runIntro(ready)
      .catch(() => root.classList.remove('v3d-motion'))
      .finally(() => {
        unlock();
        start();
      });
  }
  fonts.then(start);
  window.addEventListener('load', start, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v3d-motion');
  unlock();
  console.info('[v3d] boot failed, static page shown.', err);
}
window.__v3dready = true;
