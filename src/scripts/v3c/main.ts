// NEAR Enclave 2027 — v3C "Two Ledgers" boot.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, onReveal, checkPendingReveals, smooth, lerp, scrollTargetY } from '../v3/util';
import { createScene, type Scene, type SceneState } from './scene';
import { runIntro } from './intro';
import { initMenu } from './ui';
import { sealString } from './ledger';

declare global {
  interface Window {
    __v3cready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;
let lenis: Lenis | null = null;
let scene: Scene | null = null;
const getLenis = () => lenis;
const live = { shiftP: 0 };
let shiftST: ScrollTrigger | null = null;
const isWide = () => window.innerWidth >= 900;

/* ------------------------------------------------------------------ */
/* Scene states per chapter                                            */
/* ------------------------------------------------------------------ */
// shift: the line sweeps public → sealed, one stop per sentence (third stop = the primitive moment)
const SHIFT_STOPS = [0.86, 0.66, 0.5, 0.12];
let heroSplitY = 0; // document Y of the mobile split anchor
let statsTop = 0;
let footTop = 0;

function measure() {
  const a = $('[data-split]');
  if (a) {
    const r = a.getBoundingClientRect();
    heroSplitY = r.top + window.scrollY + r.height / 2;
  }
  const st = $('#stats');
  if (st) statsTop = st.getBoundingClientRect().top + window.scrollY;
  measureShiftGap();
  const f = $('.foot');
  if (f) footTop = f.getBoundingClientRect().top + window.scrollY;
}

const base = (): SceneState => ({ split: 0.5, axis: isWide() ? 0 : 1, field: 1, line: 1, flash: 0, tint: 1 });
function heroState(): SceneState {
  const s = base();
  if (!isWide()) s.split = (heroSplitY - window.scrollY) / window.innerHeight;
  return s;
}
function shiftSplit(p: number) {
  let v = SHIFT_STOPS[0];
  for (let i = 1; i < SHIFT_STOPS.length; i++) v = lerp(v, SHIFT_STOPS[i], smooth(i * 0.25 - 0.07, i * 0.25 + 0.05, p));
  // the last sentence keeps sealing slowly
  return v - 0.06 * smooth(0.8, 1, p);
}
let gapTop = 0.3;
let gapBot = 0.7;
function measureShiftGap() {
  const head = $('.shift__head');
  const stage = $('[data-shift-stage]');
  if (!head || !stage) return;
  const vh = window.innerHeight;
  const pin = $('.shift__pin');
  const off = pin ? pin.getBoundingClientRect().top : 0;
  gapTop = (head.getBoundingClientRect().bottom - off + 28) / vh;
  gapBot = (stage.getBoundingClientRect().top - off - 28) / vh;
  if (gapBot - gapTop < 0.1) {
    gapTop = 0.3;
    gapBot = 0.7;
  }
}
function shiftState(p: number): SceneState {
  const s = base();
  s.split = shiftSplit(p);
  if (!isWide()) s.split = gapTop + ((s.split - 0.02) / 0.84) * (gapBot - gapTop);
  s.field = 0.85;
  s.flash = Math.exp(-Math.pow((p - 0.56) / 0.06, 2));
  return s;
}
function statsState(): SceneState {
  const s = base();
  s.field = isWide() ? 0.16 : 0.12;
  s.line = isWide() ? 1 : 0;
  s.tint = isWide() ? 1 : 0;
  return s;
}
const KEYS = ['split', 'field', 'line', 'flash', 'tint'] as const;
const mix = (a: SceneState, b: SceneState, t: number) => {
  for (const k of KEYS) a[k] = lerp(a[k], b[k], t);
  return a;
};

const clearEls: HTMLElement[] = [];
const rects: Array<[number, number, number, number]> = [];
function driveScene() {
  if (!scene) return;
  const y = window.scrollY;
  const vh = window.innerHeight;
  let s = heroState();
  if (shiftST) {
    const st0 = shiftST.start;
    const st1 = shiftST.end;
    s = mix(s, shiftState(live.shiftP), smooth(st0 - vh * 0.85, st0, y));
    s = mix(s, statsState(), smooth(st1 + vh * 0.05, st1 + vh * 0.75, y));
  } else {
    // no pin (reduced motion never gets here; failure path): hero → stats
    s = mix(s, statsState(), smooth(statsTop - vh, statsTop - vh * 0.3, y));
  }
  const fo = smooth(footTop - vh, footTop - vh * 0.5, y);
  s.field *= 1 - fo;
  s.line *= 1 - fo;
  Object.assign(scene.target, s);
  if (!isWide() && y < vh) {
    // the mobile hero line is glued to the copy, no easing lag
    scene.state.split = scene.target.split;
  }
  scene.setScroll(y);

  // DOM copy that should sit on a clean background
  rects.length = 0;
  for (const el of clearEls) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -40 || r.top > vh + 40 || !r.width) continue;
    rects.push([r.left - 16, r.top - 12, r.right + 16, r.bottom + 12]);
  }
  scene.setClears(rects);

  // shift meter rides the line
  if (meter && shiftST) {
    const sp = scene.state.split;
    const pub = Math.round(sp * 100);
    if (meterPub) meterPub.textContent = String(Math.max(0, Math.min(100, pub)));
    if (meterSeal) meterSeal.textContent = String(Math.max(0, Math.min(100, 100 - pub)));
    if (isWide()) meter.style.setProperty('--sx', `${sp * document.documentElement.clientWidth}px`);
    else meter.style.setProperty('--sy', `${sp * vh}px`);
  }
}
const meter = $('[data-shift-meter]');
const meterPub = $('[data-meter-pub]');
const meterSeal = $('[data-meter-seal]');

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function heroReveal(tl: gsap.core.Timeline, at: number) {
  const pub = $$('[data-hero-pub]');
  const bars = $$('[data-hero-bar]');
  // public words slide out of the line; the private words are un-redacted back into it
  if (isWide()) tl.fromTo(pub, { x: 0, y: 0, xPercent: 104 }, { xPercent: 0, duration: 1.0, ease: 'expo.out', stagger: 0.07 }, at);
  else tl.fromTo(pub, { x: 0, y: 0, xPercent: 0, yPercent: 105 }, { yPercent: 0, duration: 1.0, ease: 'expo.out', stagger: 0.07 }, at);
  tl.fromTo(bars, { scaleX: 1 }, { scaleX: 0, transformOrigin: '0% 50%', duration: 0.8, ease: 'expo.inOut', stagger: 0.08 }, at + 0.1);
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.05 }, at + 0.15);
  tl.fromTo('[data-hero-cta]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, at + 0.35);
}

/* ------------------------------------------------------------------ */
/* Shift                                                               */
/* ------------------------------------------------------------------ */
function lineReveal(el: HTMLElement) {
  const split = SplitText.create(el, { type: 'lines', mask: 'lines' });
  gsap.from(split.lines, {
    yPercent: 110,
    duration: 1.1,
    ease: 'expo.out',
    stagger: 0.08,
    onComplete: () => split.revert(),
    onInterrupt: () => split.revert(),
  });
}

function initShift() {
  const sec = $('#shift');
  if (!sec) return;
  const items = $$('[data-shift-s]', sec);
  const h2 = $('[data-lines]', sec);
  if (h2) onReveal(h2, () => lineReveal(h2), 'top 85%');
  // opacity only, so every sentence stays readable by assistive tech
  gsap.set(items.slice(1), { opacity: 0, y: 36 });
  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: () => `+=${window.innerHeight * (isWide() ? 3 : 2.6)}`,
      pin: true,
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        live.shiftP = self.progress;
      },
    },
  });
  for (let i = 1; i < items.length; i++) {
    const at = i * 0.25 - 0.05;
    tl.to(items[i - 1], { opacity: 0, y: -36, duration: 0.05, ease: 'power2.in' }, at);
    tl.to(items[i], { opacity: 1, y: 0, duration: 0.08 }, at + 0.05);
  }
  // the primitive sentence takes the frame; the heading steps back, then returns
  const head = $('.shift__head', sec);
  if (head) {
    tl.to(head, { opacity: 0.16, duration: 0.05 }, 0.47);
    tl.to(head, { opacity: 1, duration: 0.05 }, 0.72);
  }
  tl.set({}, {}, 1);
  shiftST = tl.scrollTrigger ?? null;
}

/* ------------------------------------------------------------------ */
/* Stats: exposed on the public side, sealed + signed on the private   */
/* ------------------------------------------------------------------ */
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
function initStats(isStatic: boolean) {
  $$('[data-stat]').forEach((row) => {
    const raw = $('[data-raw]', row)!;
    const lines = $$('.stat__rl', raw);
    const finals = lines.map((l) => l.textContent ?? '');
    const sealed = finals.map(sealString);
    const mul = parseFloat(raw.dataset.mul || '1');
    const n1 = parseFloat(raw.dataset.number || '0') * mul;
    const n2 = raw.dataset.numberTo ? parseFloat(raw.dataset.numberTo) * mul : null;
    const plus = raw.dataset.plus || '';
    const state = $('[data-pub-state]', row);
    const pkt = $('[data-pkt]', row);
    const val = $('[data-stat-val]', row)!;
    const final = val.dataset.final || val.textContent || '';
    const sig = $('[data-sig]', row);
    let frame = 0;
    let lastSealed = -1;

    const render = (p: number) => {
      frame++;
      // A. the raw figure counts up, fully exposed
      const c = smooth(0, 0.42, p);
      // B. sealing sweeps left → right across its digits
      const sp = smooth(0.42, 0.66, p);
      lines.forEach((l, i) => {
        const fin = finals[i];
        let shown: string;
        if (c < 1) {
          const e = 1 - Math.pow(1 - c, 3);
          const v = i === 0 ? n1 * e : (n2 ?? 0) * e;
          shown = fmt(v) + (i === 0 && n2 !== null ? ' –' : i === 0 ? plus : '');
        } else shown = fin;
        const cut = sp > 0 ? Math.floor(sp * shown.length) : 0;
        const key = `${cut}|${shown}`;
        if (l.dataset.k !== key) {
          l.dataset.k = key;
          l.innerHTML = cut ? `<span class="stat__x">${sealed[i].slice(0, cut)}</span>${shown.slice(cut)}` : shown;
        }
      });
      const isSealed = sp >= 1 ? 1 : 0;
      if (state && isSealed !== lastSealed) {
        state.textContent = isSealed ? '· sealed' : '· exposed';
        lastSealed = isSealed;
      }
      if (pkt) {
        const k = smooth(0.48, 0.7, p);
        gsap.set(pkt, { opacity: k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0, x: lerp(-90, 0, k) });
      }
      // C. on the private side the value resolves, legible, then gets its signature
      const d = smooth(0.52, 0.78, p);
      val.style.opacity = String(lerp(0.12, 1, smooth(0.5, 0.6, p)));
      if (d >= 1 || d === 0 || isStatic) {
        if (val.textContent !== final || val.dataset.k) {
          val.textContent = final;
          delete val.dataset.k;
        }
      }
      else {
        // the redaction lifts left → right over the real value (no fake digits ever shown)
        const cut = Math.floor(d * final.length);
        const key = String(cut);
        if (val.dataset.k !== key) {
          val.dataset.k = key;
          val.innerHTML = `${final.slice(0, cut)}<span class="stat__red">${final.slice(cut)}</span>`;
        }
      }
      if (sig) {
        const g = smooth(0.78, 0.9, p);
        sig.style.opacity = String(g);
        sig.style.transform = `translateY(${(1 - g) * 10}px)`;
      }
    };

    if (isStatic) {
      render(1);
      return;
    }
    const st = { p: 0 };
    render(0);
    gsap.to(st, {
      p: 1,
      ease: 'none',
      onUpdate: () => render(st.p),
      onComplete: () => render(1),
      scrollTrigger: { trigger: row, start: 'top 82%', end: 'center 48%', scrub: 0.6 },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();
  initMenu(getLenis);
  clearEls.push(...$$('[data-clear]'));

  const canvas = $<HTMLCanvasElement>('[data-gl]');
  const lowTier = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  if (canvas) {
    try {
      scene = createScene(canvas, { isStatic: reduceMotion, lowTier });
    } catch (err) {
      scene = null;
      console.info('[v3c] WebGL unavailable, using CSS fallback.', err);
    }
  }
  root.classList.add(scene ? 'gl-on' : 'no-gl');

  window.addEventListener('request:open', () => {
    lenis?.stop();
    scene?.pause(true);
  });
  window.addEventListener('request:close', () => {
    scene?.pause(false);
    if (!root.classList.contains('menu-open')) lenis?.start();
  });
  if (scene && finePointer && !reduceMotion) {
    window.addEventListener('pointermove', (e) => scene?.setPointer(e.clientX, e.clientY), { passive: true });
  }

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.09, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
  }

  // in-page anchors through Lenis
  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    if (a.hasAttribute('data-menu-link')) return;
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      const target = hash.length > 1 ? $(hash) : null;
      if (!target) return;
      if (lenis) {
        e.preventDefault();
        lenis.scrollTo(hash === '#top' || hash === '#main' ? 0 : scrollTargetY(target), { duration: 1.4 });
        history.replaceState(null, '', hash);
      }
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  let motionOk = true;
  if (!reduceMotion) {
    for (const fn of [initShift, () => initStats(false)]) {
      try {
        fn();
      } catch (err) {
        motionOk = false;
        console.info('[v3c] section motion skipped:', err);
      }
    }
  } else {
    initStats(true);
  }

  ScrollTrigger.addEventListener('refresh', measure);
  measure();

  if (scene) {
    const sc = scene;
    if (reduceMotion) {
      // one static frame of the hero split; the canvas scrolls away with the hero
      sc.ready.then(() => {
        driveScene();
        sc.snap();
        sc.render();
      });
      const redraw = () =>
        requestAnimationFrame(() => {
          measure();
          driveScene();
          sc.snap();
          sc.render();
        });
      window.addEventListener('resize', redraw);
      window.addEventListener('scroll', redraw, { passive: true });
    } else {
      driveScene();
      sc.snap();
      gsap.ticker.add((_t, dms) => {
        driveScene();
        sc.tick(Math.min(dms, 64) / 1000);
      });
      document.addEventListener('visibilitychange', () => sc.pause(document.hidden));
    }
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) sc.dispose();
    });
  }

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const start = () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  if (reduceMotion || !motionOk) {
    root.classList.remove('v3c-motion');
    unlock();
    start();
  } else {
    runIntro({
      ready: fontsReady,
      splitAt: () => {
        measure();
        return { wide: isWide(), y: heroSplitY - window.scrollY };
      },
      onPart: () => {
        lenis?.start();
      },
      onHero: (tl, at) => heroReveal(tl, at),
    })
      .catch(() => root.classList.remove('v3c-motion'))
      .finally(() => {
        unlock();
        start();
      });
  }
  fontsReady.then(start);
  window.addEventListener('load', start, { once: true });
}

function unlock() {
  $('[data-loader]')?.remove();
  root.classList.remove('v3c-intro-long', 'v3c-intro-short');
  lenis?.start();
}

try {
  boot();
} catch (err) {
  root.classList.remove('v3c-motion');
  unlock();
  console.info('[v3c] boot failed, static page shown.', err);
}
window.__v3cready = true;
