// NEAR Enclave 2027 — v3A "Aperture" (v1 branding × v3 structure).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, onReveal, checkPendingReveals, smooth, lerp, clamp } from '../v3/util';
import { createAperture, type Aperture, type Rect } from './aperture';

declare global {
  interface Window {
    __v3aready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
let lenis: Lenis | null = null;
let ap: Aperture | null = null;
const live = { open: reduceMotion ? 1 : 0, shiftP: 0 };

const HD = () => $('[data-hd]')?.offsetHeight ?? 64;

/* ------------------------------------------------------------------ */
/* Layout mode: pinned Shift only on roomy desktops with WebGL + motion */
/* ------------------------------------------------------------------ */
const pinMQ = matchMedia('(min-width: 900px) and (min-height: 620px)');
const setPinMode = () => {
  const on = !!ap && !reduceMotion && pinMQ.matches;
  root.classList.toggle('ap-pin', on);
};

/* ------------------------------------------------------------------ */
/* Aperture rect: a weighted blend of the [data-ap] anchors near the    */
/* viewport centre, so the window glides from block → frame → slit.     */
/* ------------------------------------------------------------------ */
type Anchor = { el: HTMLElement; kind: string };
let anchors: Anchor[] = [];
const collect = () => {
  anchors = $$('[data-ap]').map((el) => ({ el, kind: el.dataset.ap! }));
};

const frameEl = $('[data-ap-frame]');
const readout = $('[data-ap-readout]');
const statsList = $('[data-stats-list]');
const statMain = $('.stat__main');
let lastLabel = '';
const out: Rect = { x: 0, y: 0, w: 0, h: 0 };
type Item = { r: Rect; w: number; kind: string };
// 0 → 1 over the last stretch of the page: closes the slit and develops any figure left
const endT = () => {
  const max = root.scrollHeight - window.innerHeight;
  return smooth(max - window.innerHeight * 0.12, max - 2, window.scrollY);
};

function computeRect(): Rect | null {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const pin = root.classList.contains('ap-pin');
  const s = (H * 0.3) ** 2;
  const items: Item[] = [];
  for (const a of anchors) {
    if (pin && a.kind === 'key') continue;
    if (!pin && a.kind === 'shift') continue;
    const b = a.el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    let r: Rect = { x: b.left, y: b.top, w: b.width, h: b.height };
    if (a.kind === 'hero') {
      const o = live.open;
      r = { x: r.x, y: r.y + (r.h * (1 - o)) / 2, w: r.w, h: r.h * o };
    }
    if (a.kind === 'shift') {
      // the window opens to the full frame for the key sentence
      const p = live.shiftP;
      const e = smooth(0.38, 0.48, p) * (1 - smooth(0.62, 0.72, p));
      const top = HD();
      const full = { x: 0, y: top, w: W, h: H - top };
      r = { x: lerp(r.x, full.x, e), y: lerp(r.y, full.y, e), w: lerp(r.w, full.w, e), h: lerp(r.h, full.h, e) };
    }
    const d = r.y + r.h / 2 - H * 0.5;
    let w = Math.exp(-(d * d) / s);
    if (a.kind === 'shift') {
      // the Shift window holds its column for as long as it is on screen,
      // so the pinned frame never scrolls away with an empty half
      const vis = clamp((Math.min(b.bottom, H) - Math.max(b.top, HD())) / b.height);
      w = Math.max(w, smooth(0.2, 0.65, vis));
    }
    items.push({ r, w, kind: a.kind });
  }
  // Stats: the aperture becomes a fixed reading slit at the viewport centre;
  // the figures scroll through it and develop from faint to solid as they pass.
  if (statsList && statMain && root.classList.contains('ap-read')) {
    const L = statsList.getBoundingClientRect();
    const m = statMain.getBoundingClientRect();
    const pres = smooth(H * 0.72, H * 0.5, L.top) * smooth(H * 0.3, H * 0.5, L.bottom) * (1 - endT());
    if (pres > 0.001) {
      const h = W < 768 ? 14 : 18;
      const w = m.width * (0.15 + 0.85 * pres);
      items.push({ r: { x: m.left + (m.width - w) / 2, y: H * 0.5 - h / 2, w, h }, w: pres, kind: 'read' });
    }
  }
  let sw = 0;
  for (const it of items) sw += it.w;
  if (sw < 1e-4) return null;
  // Hand-off, never travel: the aperture always sits exactly on its dominant anchor
  // (so it moves with its own block and never slides over copy). As a second anchor
  // gains weight the window closes like a shutter, and reopens on the new anchor.
  items.sort((p, q) => q.w - p.w);
  const top = items[0];
  const second = items[1];
  const t = second ? second.w / (top.w + second.w) : 0; // 0 … 0.5
  const open = 1 - smooth(0.12, 0.46, t);
  const lane = top.kind === 'read' ? 1 : 0;
  const hero = top.kind === 'hero' ? 1 : 0;
  const sq = 1 - open;
  out.x = top.r.x;
  out.w = top.r.w;
  out.h = top.r.h * open;
  out.y = top.r.y + (top.r.h - out.h) / 2;
  if (out.h < 0.75) return null;

  ap?.setLane(lane);
  if (frameEl) {
    const st = frameEl.style;
    st.setProperty('--x', `${out.x.toFixed(1)}px`);
    st.setProperty('--y', `${out.y.toFixed(1)}px`);
    st.setProperty('--w', `${out.w.toFixed(1)}px`);
    st.setProperty('--h', `${out.h.toFixed(1)}px`);
    // v1 hairline + edge readouts: hero only, and only when there is room beside the window
    const ro = hero * live.open * (1 - sq);
    st.setProperty('--ro', ro.toFixed(3));
    st.setProperty('--lbo', (ro * smooth(190, 240, out.x)).toFixed(3));
    st.setProperty('--lo', smooth(60, 140, out.h).toFixed(3));
  }
  if (readout) {
    const pct = Math.round(clamp((out.w * out.h) / (W * H)) * 100);
    const label = `Aperture ${String(pct).padStart(3, '0')}%`;
    if (label !== lastLabel) {
      readout.textContent = label;
      lastLabel = label;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */
const shiftSec = $('[data-shift]');
const shiftContent = $('[data-shift-content]');
const shiftOver = $('[data-shift-over]');
const shiftItems = $$('[data-shift-s]');
const STEPS = [0.06, 0.2, 0.76, 0.84];
function driveShift() {
  if (!shiftSec || !root.classList.contains('ap-pin')) return;
  const r = shiftSec.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  const p = span > 0 ? clamp(-r.top / span) : 0;
  live.shiftP = p;
  // copy under the window clears out before it expands, and returns after it closes
  const hide = smooth(0.31, 0.37, p) * (1 - smooth(0.72, 0.78, p));
  const e = smooth(0.44, 0.5, p) * (1 - smooth(0.6, 0.66, p));
  if (shiftContent) {
    shiftContent.style.opacity = (1 - hide).toFixed(3);
    shiftContent.style.visibility = hide > 0.999 ? 'hidden' : '';
  }
  if (shiftOver) {
    shiftOver.style.opacity = e.toFixed(3);
    shiftOver.style.transform = `translateY(${((1 - e) * 24).toFixed(1)}px)`;
  }
  shiftItems.forEach((li, i) => li.classList.toggle('is-on', p >= STEPS[i]));
}

type StatRow = { el: HTMLElement; cut: number; done: boolean; run: () => void };
let statRows: StatRow[] = [];
function initStats() {
  statRows = $$('[data-stat]').map((row) => {
    const el = $('[data-stat-val]', row)!;
    const final = el.dataset.final || el.textContent || '';
    const n = parseFloat(el.dataset.number || '0');
    const to = el.dataset.numberTo ? parseFloat(el.dataset.numberTo) : NaN;
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    const item: StatRow = {
      el,
      cut: 0,
      done: false,
      run: () => {
        if (item.done) return;
        item.done = true;
        ap?.flash();
        const o = { v: 0 };
        gsap.to(o, {
          v: 1,
          duration: 1.4,
          ease: 'power3.out',
          onUpdate: () => {
            const a = (n * o.v).toFixed(dec);
            el.textContent = isNaN(to) ? `${pre}${a}${suf}` : `${pre}${a}–${(to * o.v).toFixed(dec)}${suf}`;
          },
          onComplete: () => {
            el.textContent = final;
          },
        });
      },
    };
    // without the reading slit, count up on reveal
    if (!root.classList.contains('ap-read') && !reduceMotion) onReveal(row, item.run, 'top 70%');
    return item;
  });
}
function driveStats() {
  if (!root.classList.contains('ap-read')) return;
  const mid = window.innerHeight * 0.5;
  for (const s of statRows) {
    const r = s.el.getBoundingClientRect();
    const c = Math.max(clamp((mid - r.top) / Math.max(1, r.height)), r.top < window.innerHeight ? endT() : 0);
    if (c > s.cut + 0.001 || (c >= 1 && s.cut < 1)) {
      s.cut = c;
      s.el.style.setProperty('--cut', `${(c * 100).toFixed(1)}%`);
    }
    if (c > 0.02) s.run();
  }
}

function heroReveal(tl: gsap.core.Timeline, at: number, short: boolean) {
  const k = short ? 0.6 : 1;
  tl.fromTo('[data-hero-line]', { yPercent: 105, y: 0 }, { yPercent: 0, duration: 1.1 * k, ease: 'expo.out', stagger: 0.09 * k }, at);
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8 * k, ease: 'power3.out', stagger: 0.06 * k }, at + 0.1 * k);
  tl.to(live, { open: 1, duration: 1.1 * k, ease: 'expo.inOut' }, at + 0.05);
}

/* ------------------------------------------------------------------ */
/* Intro: cream sheet, a hairline draws, the sheet lifts, the line      */
/* becomes the hero aperture. ~1 s first visit, ≤0.4 s repeat.          */
/* ------------------------------------------------------------------ */
function runIntro(): Promise<void> {
  const loader = $('[data-loader]');
  const short = root.classList.contains('v3a-intro-short');
  const finish = () => {
    loader?.remove();
    root.classList.remove('v3a-intro-long', 'v3a-intro-short');
    try {
      sessionStorage.setItem('v3a-intro', '1');
    } catch {
      /* private mode */
    }
    lenis?.start();
  };
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        finish();
        resolve();
      },
    });
    if (loader) {
      const rule = $('[data-ld-rule]', loader);
      const D = short ? 0.14 : 0.45;
      tl.to(rule, { scaleX: 1, duration: D, ease: 'expo.inOut' }, 0);
      const F = short ? 0.16 : 0.3;
      tl.to(loader, { opacity: 0, duration: F, ease: 'power2.out' }, D);
      tl.add(() => {
        loader.style.pointerEvents = 'none';
        lenis?.start();
      }, D);
      tl.add(() => {
        loader.remove();
        root.classList.remove('v3a-intro-long', 'v3a-intro-short');
        (window as any).__v3aLoaderMs = performance.now() - t0;
      }, D + F);
      heroReveal(tl, D * 0.9, short);
    } else {
      heroReveal(tl, 0, true);
    }
    setTimeout(() => {
      tl.progress(1);
    }, 3500);
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();

  const canvas = $<HTMLCanvasElement>('[data-ap-gl]');
  const lowTier = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768 || !finePointer;
  if (canvas && !reduceMotion) {
    try {
      ap = createAperture(canvas, { lowTier, isStatic: false });
    } catch (err) {
      ap = null;
      console.info('[v3a] WebGL unavailable, using CSS fallback.', err);
    }
  }
  root.classList.add(ap ? 'gl-on' : 'no-gl');
  if (ap) root.classList.add('ap-read');
  setPinMode();
  collect();

  if (!reduceMotion) {
    lenis = new Lenis({ lerp: 0.085, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if ($('[data-loader]')) lenis.stop();
    window.addEventListener('request:open', () => lenis?.stop());
    window.addEventListener('request:close', () => lenis?.start());
  }

  // anchors (header offset; pinned Shift lands at its start)
  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      const target = hash.length > 1 ? $(hash) : null;
      if (!target) return;
      e.preventDefault();
      const y = hash === '#top' ? 0 : target.getBoundingClientRect().top + window.scrollY - (hash === '#shift' ? 0 : HD());
      if (lenis) lenis.scrollTo(y, { duration: 1.4 });
      else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', hash);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  // progress hairline (flat ink)
  const bar = $('[data-progress]');
  const onScroll = () => {
    const max = root.scrollHeight - window.innerHeight;
    const p = max > 0 ? clamp(window.scrollY / max) : 0;
    if (bar) bar.style.transform = `scaleX(${p})`;
  };

  if (finePointer && ap) {
    window.addEventListener('pointermove', (e) => ap?.setPointer(e.clientX, e.clientY), { passive: true });
  }

  initStats();

  pinMQ.addEventListener('change', () => {
    setPinMode();
    ScrollTrigger.refresh();
  });

  gsap.ticker.add((_t, dms) => {
    onScroll();
    driveShift();
    driveStats();
    if (ap) {
      ap.setRect(computeRect());
      ap.frame(dms / 1000, window.scrollY);
    }
  });

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(() => {
    ap?.ready();
    ScrollTrigger.refresh();
    checkPendingReveals();
  });
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  }, { once: true });

  if (reduceMotion) {
    onScroll();
    return;
  }
  runIntro().finally(() => {
    ScrollTrigger.refresh();
    checkPendingReveals();
  });
}

try {
  boot();
} catch (err) {
  root.classList.remove('v3a-motion', 'v3a-intro-long', 'v3a-intro-short');
  $('[data-loader]')?.remove();
  console.info('[v3a] boot failed, static page shown.', err);
}
window.__v3aready = true;
