// NEAR Enclave 2027 — v4A-NEARCON 2A boot.
// Two 3D wire models (city, vault) turn without stop inside their circles; scroll velocity boosts
// every rotation with an eased return. Leader lines tie each circle to its words in the h1. The cream
// panel slides over the sticky hero, then the line art of each section traces with the scroll.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initRequestModal } from '../request-modal';
import { $, $$, reduceMotion, finePointer, onReveal, checkPendingReveals } from '../v3/util';
import { city, vaultStatic, vaultWheel, render, CAM, type Model, type Cam } from '../../components/v4a-nearcon-2a/geo';

declare global {
  interface Window {
    __q1ready?: boolean;
  }
}

gsap.registerPlugin(ScrollTrigger);
const root = document.documentElement;
const motion = !reduceMotion && root.classList.contains('q1-motion');
let lenis: Lenis | null = null;
let modalOpen = false;

/* ------------------------------------------------------------------ */
/* rigs: the turning models                                            */
/* ------------------------------------------------------------------ */
const CITY = city();
const VAULT = vaultStatic();

class Rig {
  svg: SVGSVGElement;
  kind: 'city' | 'vault';
  hero: boolean;
  paths: SVGPathElement[];
  pulse: SVGPathElement | null;
  nodes: SVGCircleElement[];
  blinks: SVGCircleElement[];
  spin: SVGGElement | null;
  spin2: SVGGElement | null;
  model: Model;
  cam: Cam;
  inView = false;
  th = 0;
  phase = 0;
  phi = 0.3;
  rot = 0;
  rot2 = 0;
  run = 0;

  constructor(svg: SVGSVGElement, hero: boolean) {
    this.svg = svg;
    this.kind = svg.dataset.rig === 'vault' ? 'vault' : 'city';
    this.hero = hero;
    this.paths = $$<SVGPathElement>('[data-p]', svg);
    this.pulse = svg.querySelector('[data-pulse]');
    this.nodes = $$<SVGCircleElement>('[data-n]', svg);
    this.blinks = $$<SVGCircleElement>('[data-b]', svg);
    this.spin = svg.querySelector('[data-spin]');
    this.spin2 = svg.querySelector('[data-spin2]');
    this.model = this.kind === 'city' ? CITY : VAULT;
    this.cam = { ...(this.kind === 'city' ? CAM.city : CAM.vault) };
    this.th = this.cam.th;
    if (!hero) this.phase = 1.7;
  }

  step(dt: number, k: number, tilt: { x: number; y: number }) {
    const city = this.kind === 'city';
    // turntable: the city turns all the way round; the vault swings so its door stays in view
    // 2A: roughly half the angular speed of 1A and a narrower swing, so the models stay alive but calm
    if (city) this.th += dt * 0.14 * k;
    else {
      this.phase += dt * 0.24 * k;
      this.phi += dt * 0.5 * k;
    }
    const th = city ? this.th : 0.42 * Math.sin(this.phase);
    const cam: Cam = { ...this.cam, th: th + (this.hero ? tilt.x * 0.1 : 0), el: this.cam.el + (this.hero ? tilt.y * 0.05 : 0) };
    const fr = this.kind === 'city' ? render(this.model, cam) : render(this.model, cam, vaultWheel(this.phi));
    for (let i = 0; i < this.paths.length; i++) this.paths[i].setAttribute('d', fr.d[i]);
    this.pulse?.setAttribute('d', fr.pulse);
    for (let i = 0; i < this.nodes.length && i < fr.nodes.length; i++) {
      const [x, y, b] = fr.nodes[i];
      const n = this.nodes[i];
      n.setAttribute('cx', String(x));
      n.setAttribute('cy', String(y));
      n.setAttribute('class', `nd b${b}`);
    }
    for (let i = 0; i < this.blinks.length; i++) {
      this.blinks[i].setAttribute('cx', String(fr.blink[i][0]));
      this.blinks[i].setAttribute('cy', String(fr.blink[i][1]));
    }
    // tick ring and inner ring counter-turn; each circle turns its own way
    const dir = city ? 1 : -1;
    this.rot = (this.rot + dt * 3.6 * k * dir) % 360;
    this.rot2 = (this.rot2 - dt * 2.2 * k * dir) % 360;
    this.spin?.setAttribute('transform', `rotate(${this.rot.toFixed(2)} 200 200)`);
    this.spin2?.setAttribute('transform', `rotate(${this.rot2.toFixed(2)} 200 200)`);
    this.run = (this.run - dt * 0.024 * k) % 1;
    if (this.pulse) this.pulse.style.strokeDashoffset = this.run.toFixed(4);
  }
}

const rigs: Rig[] = [];
let heroCovered = false;
let boost = 0;
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let raf = 0;
let last = 0;

function active(r: Rig) {
  return r.inView && !(r.hero && heroCovered);
}
function frame(now: number) {
  raf = 0;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;
  // scroll velocity → boost: fast attack, slow eased return
  const v = Math.abs(lenis?.velocity ?? 0);
  const target = Math.min(1.6, v * 0.035);
  const rate = target > boost ? 7 : 1.4;
  boost += (target - boost) * (1 - Math.exp(-dt * rate));
  const k = 1 + boost;
  tilt.x += (tilt.tx - tilt.x) * (1 - Math.exp(-dt * 3));
  tilt.y += (tilt.ty - tilt.y) * (1 - Math.exp(-dt * 3));
  let any = false;
  for (const r of rigs) {
    const on = active(r);
    r.svg.classList.toggle('is-paused', !on);
    if (!on) continue;
    any = true;
    r.step(dt, k, tilt);
  }
  if (any && !modalOpen && !document.hidden) raf = requestAnimationFrame(frame);
  else last = 0;
}
function wake() {
  if (!motion || raf || modalOpen || document.hidden) return;
  if (!rigs.some(active)) {
    rigs.forEach((r) => r.svg.classList.toggle('is-paused', !active(r)));
    return;
  }
  last = 0;
  raf = requestAnimationFrame(frame);
}
function sleep() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
}

function initRigs() {
  $$<SVGSVGElement>('[data-rig]').forEach((svg) => rigs.push(new Rig(svg, !!svg.closest('[data-hero]'))));
  if (!motion) return;
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        const r = rigs.find((x) => x.svg === e.target);
        if (r) r.inView = e.isIntersecting;
      }
      wake();
    },
    { rootMargin: '60px 0px' },
  );
  rigs.forEach((r) => io.observe(r.svg));
  document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));
  if (finePointer) {
    const hero = $('[data-hero]')!;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (heroCovered) return;
        const b = hero.getBoundingClientRect();
        tilt.tx = (e.clientX - b.left) / b.width - 0.5;
        tilt.ty = (e.clientY - b.top) / b.height - 0.5;
      },
      { passive: true },
    );
  }
}

/* ------------------------------------------------------------------ */
/* draw helpers                                                        */
/* ------------------------------------------------------------------ */
type Ends = { x1: number; y1: number; x2: number; y2: number; px: number; py: number };
function lineEnds(l: SVGLineElement): Ends {
  const n = (k: string) => parseFloat(l.getAttribute(k) || '0');
  const x1 = n('x1'), y1 = n('y1'), x2 = n('x2'), y2 = n('y2');
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((200 - x1) * dx + (200 - y1) * dy) / (dx * dx + dy * dy)));
  return { x1, y1, x2, y2, px: x1 + dx * t, py: y1 + dy * t };
}
function drawRig(svg: SVGSVGElement, tl: gsap.core.Timeline, at = 0) {
  const ring = $$<SVGElement>('.rig__ring[data-draw]', svg);
  const art = $$<SVGElement>('.rig__art [data-draw]', svg);
  const fades = $$<SVGElement>('[data-fade]', svg);
  const pops = $$<SVGElement>('[data-pop]', svg);
  const pulse = $$<SVGElement>('[data-pulse]', svg);
  tl.to(ring, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' }, at);
  $$<SVGLineElement>('[data-grow]', svg).forEach((l, i) => {
    const e = lineEnds(l);
    tl.fromTo(l, { opacity: 1, attr: { x1: e.px, y1: e.py, x2: e.px, y2: e.py } }, { attr: { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }, duration: 1.2, ease: 'power3.inOut' }, at + 0.2 + i * 0.1);
  });
  tl.to(art, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.03 }, at + 0.1);
  tl.to(fades, { opacity: 1, duration: 0.6 }, at + 0.5);
  tl.fromTo(pops, { opacity: 0, scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.4)', stagger: { amount: 0.35 } }, at + 0.7);
  tl.to(pulse, { opacity: 1, duration: 0.6 }, at + 1.1);
}

/* ------------------------------------------------------------------ */
/* hero: intro, leader lines, the cover                                */
/* ------------------------------------------------------------------ */
function layoutLeaders() {
  const svg = $<SVGSVGElement>('[data-lead]');
  const inner = $('[data-hero-in]');
  if (!svg || !inner) return;
  if (getComputedStyle(svg).display === 'none') return;
  const ib = inner.getBoundingClientRect();
  const f = inner.offsetWidth / ib.width || 1;
  const loc = (x: number, y: number): [number, number] => [(x - ib.left) * f, (y - ib.top) * f];
  const groups = $$<SVGGElement>('[data-lead-g]', svg);
  (['city', 'vault'] as const).forEach((kind, i) => {
    const orb = $(`[data-orb="${kind}"]`, inner);
    const word = $(`[data-anchor="${kind}"]`, inner);
    const g = groups[i];
    if (!orb || !word || !g) return;
    const ob = orb.getBoundingClientRect();
    const wb = word.getBoundingClientRect();
    const lb = (word.parentElement as HTMLElement).getBoundingClientRect();
    const r = (ob.width * 184) / 400;
    const a = ((kind === 'city' ? 50 : 130) * Math.PI) / 180;
    const [sx, sy] = loc(ob.left + ob.width / 2 + r * Math.cos(a), ob.top + ob.width / 2 + r * Math.sin(a));
    const [ex, ey] = loc(kind === 'city' ? wb.left - 18 : wb.right + 18, lb.top + lb.height * 0.48);
    const dir = kind === 'city' ? 1 : -1;
    const drop = Math.max(0, ey - sy);
    let mx = sx + dir * drop;
    if ((dir > 0 && mx > ex - 24) || (dir < 0 && mx < ex + 24)) mx = ex - dir * 24;
    const d = `M${sx.toFixed(1)} ${sy.toFixed(1)}L${mx.toFixed(1)} ${ey.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
    g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
    const o = g.querySelector('[data-lead-o]')!;
    o.setAttribute('cx', sx.toFixed(1));
    o.setAttribute('cy', sy.toFixed(1));
    const dot = g.querySelector('[data-lead-dot]')!;
    dot.setAttribute('cx', ex.toFixed(1));
    dot.setAttribute('cy', ey.toFixed(1));
  });
}

function heroIntro(tl: gsap.core.Timeline) {
  const hero = $('[data-hero]');
  if (!hero) return;
  tl.to('.hud', { opacity: 1, duration: 0.6 }, 0.1);
  $$<SVGSVGElement>('[data-rig]', hero).forEach((s, i) => drawRig(s, tl, i * 0.18));
  tl.to('[data-hl]', { y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.3);
  tl.to('.hero [data-hin]', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, 0.55);
  tl.to('[data-rule]', { scaleY: 1, duration: 0.9, ease: 'power3.inOut' }, 0.6);
  const leads = $$<SVGPathElement>('[data-lead-p]', hero);
  tl.set('.lead__g', { opacity: 1 }, 1.15);
  tl.fromTo(leads, { strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.12 }, 1.15);
  tl.fromTo('[data-lead-o], [data-lead-dot]', { scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' }, { scale: 1, duration: 0.4, ease: 'back.out(2.4)', stagger: 0.08 }, 1.5);
  // the leader line arrives at each word, then keeps going: a ruled underline traces out under it
  $$<HTMLElement>('[data-ul]', hero).forEach((ul, i) => {
    tl.to(ul.querySelector('.ul__ln'), { scaleX: 1, duration: 0.9, ease: 'power3.inOut' }, 1.75 + i * 0.14);
    const from = i ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
    tl.fromTo(ul.querySelector('.ul__tk'), { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'steps(10)' }, 1.9 + i * 0.14);
  });
  tl.call(() => hero.classList.add('is-live'), [], 2.9);
}

function initCover() {
  const shift = $('[data-shift]');
  const inner = $('[data-hero-in]');
  const shade = $('[data-shade]');
  if (!shift) return;
  ScrollTrigger.create({
    trigger: shift,
    start: 'top top',
    end: 'max',
    onToggle: (s) => {
      heroCovered = s.isActive;
      $('[data-hero]')?.classList.toggle('is-covered', s.isActive);
      wake();
    },
  });
  if (!motion || !inner || !shade) return;
  const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: shift, start: 'top bottom', end: 'top top', scrub: true } });
  tl.to(inner, { scale: 0.9, yPercent: -5 }, 0).to(shade, { opacity: 0.6 }, 0);
}

/* header: cream on dark zones, ink on cream */
function initHud() {
  const hud = $('[data-hud]');
  const shift = $('[data-shift]');
  const dark = $$('[data-dark]').filter((d) => !d.hasAttribute('data-hero'));
  if (!hud) return;
  const update = () => {
    const y = hud.offsetHeight / 2;
    let onDark = !!shift && shift.getBoundingClientRect().top > y;
    if (!onDark) for (const d of dark) {
      const b = d.getBoundingClientRect();
      if (b.top <= y && b.bottom >= y) { onDark = true; break; }
    }
    hud.classList.toggle('is-light', !onDark);
    hud.classList.toggle('is-scrolled', onDark && window.scrollY > 24);
  };
  if (lenis) lenis.on('scroll', update);
  else window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ------------------------------------------------------------------ */
/* sections                                                            */
/* ------------------------------------------------------------------ */
// The Shift chart traces in reading order over a short scroll: frame and rulers, the three lanes,
// open networks, the rails and the capital climbing off them, then the privacy slot closes last.
function initFlow() {
  const svg = $<SVGSVGElement>('[data-flow]');
  if (!svg) return;
  const q = (s: string) => $$<SVGElement>(s, svg);
  const pop = { opacity: 0, scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' } as gsap.TweenVars;
  const on = { opacity: 1, scale: 1, duration: 0.06, ease: 'back.out(2.2)' } as gsap.TweenVars;
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: svg, start: 'top 84%', end: 'center 48%', scrub: 0.6,
      onUpdate: (st) => svg.classList.toggle('is-drawn', st.progress > 0.97),
    },
  });
  tl.to(q('[data-f-axis]'), { strokeDashoffset: 0, duration: 0.16 }, 0)
    .fromTo(q('[data-f-origin]'), pop, on, 0)
    .to(q('[data-f-tick]'), { opacity: 1, duration: 0.02, stagger: { amount: 0.16 } }, 0.02)
    .to(q('[data-f-tip]'), { opacity: 1, duration: 0.04 }, 0.15)
    .to(q('[data-f-grid]'), { opacity: 1, duration: 0.1 }, 0.1)
    .fromTo(q('[data-f-start]'), pop, { ...on, stagger: 0.03 }, 0.1)
    .to(q('[data-f-lane]'), { strokeDashoffset: 0, duration: 0.26, stagger: 0.05, ease: 'power1.inOut' }, 0.12)
    .to(q('[data-f-lbl]').slice(1, 4), { opacity: 1, duration: 0.06, stagger: 0.04 }, 0.16)
    .to(q('[data-f-ghost]'), { opacity: 1, duration: 0.08 }, 0.3)
    .fromTo(q('[data-f-node]'), pop, { ...on, stagger: 0.02 }, 0.42)
    .to(q('[data-f-halo-c]'), { opacity: 1, duration: 0.06 }, 0.46)
    .to(q('[data-f-lbl]')[4], { opacity: 1, duration: 0.06 }, 0.46)
    .to(q('[data-f-rail]'), { strokeDashoffset: 0, duration: 0.2, stagger: 0.04 }, 0.4)
    .to(q('[data-f-sleeper]'), { opacity: 1, duration: 0.12 }, 0.46)
    .to(q('[data-f-gate]'), { opacity: 1, duration: 0.05 }, 0.56)
    .fromTo(q('[data-f-block]'), pop, { ...on, stagger: 0.015 }, 0.5)
    .to(q('[data-f-lbl]')[0], { opacity: 1, duration: 0.06 }, 0.54)
    .to(q('[data-f-follow]'), { strokeDashoffset: 0, duration: 0.14, ease: 'power1.inOut' }, 0.6)
    .to(q('[data-f-out]'), { strokeDashoffset: 0, duration: 0.1 }, 0.7)
    .to(q('[data-f-ring]'), { strokeDashoffset: 0, duration: 0.12, ease: 'power1.inOut' }, 0.78)
    .fromTo(q('[data-f-fill]'), pop, { ...on, duration: 0.07 }, 0.88)
    .to(q('[data-f-lbl]')[5], { opacity: 1, duration: 0.06 }, 0.88)
    .to(q('[data-f-out2]'), { strokeDashoffset: 0, duration: 0.07 }, 0.92)
    .fromTo(q('[data-f-arrow]'), pop, on, 0.98);

  // Playhead: sweeps the time axis with the scroll; a dot rides each lane at the playhead's x.
  const ph = $<SVGGElement>('[data-f-ph]', svg);
  const dots = q('[data-f-dot]') as SVGCircleElement[];
  const lanes = q('[data-f-lane]') as SVGPathElement[];
  if (!ph || dots.length !== lanes.length) return;
  const tables = lanes.map((l) => {
    const len = l.getTotalLength();
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) {
      const p = l.getPointAtLength((len * i) / 120);
      pts.push([p.x, p.y]);
    }
    return pts;
  });
  const yAt = (pts: [number, number][], x: number) => {
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return pts[0][1];
  };
  const place = (p: number) => {
    const x = 40 + p * (452 - 40);
    ph.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
    dots.forEach((d, i) => {
      d.setAttribute('cx', x.toFixed(1));
      d.setAttribute('cy', yAt(tables[i], x).toFixed(1));
    });
  };
  place(0);
  ScrollTrigger.create({ trigger: svg, start: 'center 48%', end: 'bottom 5%', scrub: true, onUpdate: (st) => place(st.progress) });
}

function initDividers() {
  $$<SVGSVGElement>('[data-dv]').forEach((dv) => {
    const rings = $$<SVGElement>('[data-dv-ring]', dv);
    const fills = $$<SVGElement>('[data-dv-fill]', dv);
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: dv, start: 'top 92%', end: 'top 45%', scrub: 0.6 } });
    tl.to(rings, { strokeDashoffset: 0, duration: 0.3, stagger: 0.08 }, 0);
    tl.fromTo(fills, { attr: { r: 0 } }, { attr: { r: 17.5 }, duration: 0.18, stagger: 0.16, ease: 'back.out(1.6)' }, 0.38);
  });
}

// Each figure: the rule draws, a ruler of ticks steps across it, the accent block and index pop,
// the number rises out of its mask while it counts, the cells fill, then label and source follow.
function initStats() {
  $$('[data-stat]').forEach((st, i) => {
    const val = st.querySelector<HTMLElement>('[data-val]')!;
    const num = st.querySelector<HTMLElement>('[data-st-num]');
    const cells = $$('.px__c', st);
    const rule = st.querySelector('[data-rule-x]');
    const ruler = st.querySelector('[data-st-ruler]');
    const final = val.textContent || '';
    const n = parseFloat(st.dataset.n || '0');
    const n2 = st.dataset.n2 ? parseFloat(st.dataset.n2) : null;
    const dec = parseInt(st.dataset.dec || '0', 10);
    const m = final.match(/^([^0-9]*)[0-9.]+(?:–[0-9.]+)?(.*)$/);
    const pre = m?.[1] ?? '';
    const suf = m?.[2] ?? '';
    const fmt = (v: number) => v.toFixed(dec);
    val.textContent = `${pre}${fmt(0)}${n2 !== null ? '–' + fmt(0) : ''}${suf}`;
    onReveal(st, () => {
      const tl = gsap.timeline({ delay: (i % 4) * 0.12 });
      if (rule) tl.to(rule, { scaleX: 1, duration: 0.9, ease: 'power3.inOut' }, 0);
      if (ruler) tl.fromTo(ruler, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'steps(20)' }, 0.2);
      tl.fromTo(st.querySelector('[data-st-blk]'), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.6)' }, 0.25);
      tl.to(st.querySelector('[data-st-idx]'), { opacity: 1, duration: 0.5 }, 0.35);
      if (num) tl.to(num, { y: 0, yPercent: 0, duration: 1, ease: 'expo.out' }, 0.3);
      const o = { p: 0 };
      tl.to(o, {
        p: 1,
        duration: 1.8,
        ease: 'power3.out',
        onUpdate: () => {
          val.textContent = `${pre}${fmt(n * o.p)}${n2 !== null ? '–' + fmt(n2 * o.p) : ''}${suf}`;
          const on = Math.round(o.p * cells.length);
          cells.forEach((c, k) => c.classList.toggle('is-on', k < on));
        },
        onComplete: () => {
          val.textContent = final;
          cells.forEach((c) => c.classList.add('is-on'));
        },
      }, 0.35);
      tl.to($$('[data-st-txt]', st), { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1 }, 0.7);
    }, 'top 88%');
  });
}

// Format skyline: fully traced while the circle is comfortably in view (top 88% → its centre at 56%),
// instead of needing the whole screen of scroll. The instrument around it keeps turning with the scroll.
function initSky() {
  const sky = $<SVGSVGElement>('[data-sky]');
  if (!sky) return;
  const q = (s: string) => $$<SVGElement>(s, sky);
  const pop = { opacity: 0, scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' } as gsap.TweenVars;
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: sky, start: 'top 88%', end: 'center 56%', scrub: 0.5,
      onUpdate: (st) => sky.classList.toggle('is-drawn', st.progress > 0.97),
    },
  });
  tl.to(q('.sky__ring'), { strokeDashoffset: 0, duration: 0.3, ease: 'power1.inOut' }, 0)
    .to(q('[data-sky-ticks]'), { opacity: 1, duration: 0.15 }, 0.05)
    .to(q('[data-sky-x]'), { opacity: 1, duration: 0.08 }, 0.12)
    .fromTo(q('[data-sky-card]'), pop, { opacity: 1, scale: 1, duration: 0.06, stagger: 0.03, ease: 'back.out(2.4)' }, 0.16)
    .to(q('[data-sky-in]'), { opacity: 1, duration: 0.1 }, 0.2)
    .to(q('.sky__l[data-draw]'), { strokeDashoffset: 0, duration: 0.34, stagger: { amount: 0.26 } }, 0.12)
    .to(q('.sky__l[data-fade]'), { opacity: 1, duration: 0.06 }, 0.58)
    .to(q('[data-face]'), { opacity: 0.92, duration: 0.1, stagger: 0.04 }, 0.6)
    .fromTo(q('[data-sky-lt]'), { opacity: 0 }, { opacity: 1, duration: 0.02, stagger: { amount: 0.22, from: 'random' } }, 0.7)
    .fromTo(q('[data-sky-bc]'), pop, { opacity: 1, scale: 1, duration: 0.06, stagger: 0.04, ease: 'back.out(2.4)' }, 0.86)
    .to(q('[data-sky-txt]'), { opacity: 1, duration: 0.12 }, 0.84);
  const spin = sky.querySelector('[data-sky-spin]');
  const spin2 = sky.querySelector('[data-sky-spin2]');
  const st = { trigger: sky, start: 'top bottom', end: 'bottom top', scrub: true };
  if (spin) gsap.fromTo(spin, { rotation: -30, svgOrigin: '200 200' }, { rotation: 60, svgOrigin: '200 200', ease: 'none', scrollTrigger: st });
  if (spin2) gsap.fromTo(spin2, { rotation: 20, svgOrigin: '200 200' }, { rotation: -40, svgOrigin: '200 200', ease: 'none', scrollTrigger: { ...st } });
}

function initReveals() {
  $$('[data-rise]').forEach((el) => onReveal(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }), 'top 90%'));
  $$('.ag, .pg').forEach((row) => {
    const rule = row.querySelector('[data-rule-x]');
    if (rule) onReveal(row, () => gsap.to(rule, { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }), 'top 90%');
  });
  // the register: each seat's rule draws, then its index and words rise, staggered along the row
  $$('[data-reg-it]').forEach((it, i) => {
    const col = i === 0 ? 0 : (i - 1) % 3;
    onReveal(it, () => {
      const tl = gsap.timeline({ delay: col * 0.12 });
      tl.to(it.querySelector('[data-rule-x]'), { scaleX: 1, duration: 1, ease: 'power3.inOut' }, 0)
        .to($$('.reg__meta, .reg__t', it), { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, 0.25);
    }, 'top 90%');
  });
  // the breath rigs trace when they arrive
  const breath = $('[data-breath]');
  if (breath) onReveal(breath, () => {
    const tl = gsap.timeline();
    $$<SVGSVGElement>('[data-rig]', breath).forEach((s, i) => drawRig(s, tl, i * 0.15));
  }, 'top 75%');
  $$<SVGSVGElement>('[data-seat]').forEach((s, i) =>
    onReveal(s, () => gsap.to($$('[data-draw]', s), { strokeDashoffset: 0, duration: 1.1, delay: i * 0.12, ease: 'power2.inOut', stagger: 0.2 }), 'top 90%'),
  );
  // Footer mark: rings open from one flat ellipse into the stacked tunnel while they trace, tied to the
  // last stretch of scroll so the motion plays where the reader is looking; runners orbit once drawn.
  const ell = $<SVGSVGElement>('.foot__ell');
  if (ell) {
    const rings = $$<SVGEllipseElement>('[data-draw]', ell);
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: ell, start: 'top 85%', endTrigger: 'html', end: 'bottom bottom', scrub: 0.8,
        onUpdate: (st) => ell.classList.toggle('is-drawn', st.progress > 0.98),
      },
    });
    tl.fromTo($('[data-axis]', ell), { scaleX: 0, svgOrigin: '200 60' }, { scaleX: 1, svgOrigin: '200 60', duration: 0.35 }, 0)
      .from($$('[data-node]', ell), { scale: 0, svgOrigin: '200 60', duration: 0.3 }, 0.05)
      .to(rings, { strokeDashoffset: 0, duration: 0.55, stagger: { each: 0.05, from: 'end' } }, 0.1)
      .fromTo(rings, { attr: { cy: 60 }, scaleY: 0.35, svgOrigin: '200 60' }, { attr: { cy: (_: number, el: Element) => (el as SVGElement).dataset.cy }, scaleY: 1, svgOrigin: '200 60', duration: 0.6, stagger: { each: 0.04, from: 'end' } }, 0.25);
  }
}

// Footer: the event name is fitted to the full width; the outline fills with the gradient over the
// last stretch of scroll, the bar's ruler draws, and the columns rise.
function fitWord() {
  const w = $('[data-foot-word]');
  const fit = $('[data-foot-fit]');
  if (!w || !fit) return;
  w.style.fontSize = '';
  const avail = w.clientWidth;
  const used = fit.getBoundingClientRect().width;
  if (!avail || !used) return;
  const fs = parseFloat(getComputedStyle(w).fontSize);
  w.style.fontSize = `${Math.floor(fs * (avail / used) * 1000) / 1000}px`;
}
function initFoot() {
  const foot = $('[data-foot]');
  if (!foot) return;
  $$('[data-foot-rise]', foot).forEach((el, i) =>
    onReveal(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 1, delay: (i % 4) * 0.08, ease: 'power3.out' }), 'top 92%'),
  );
  const fill = $('[data-foot-fill]', foot);
  if (fill) {
    gsap.fromTo(fill, { clipPath: 'inset(0% 100% 0% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
      scrollTrigger: { trigger: '[data-foot-word]', start: 'top 92%', endTrigger: 'html', end: 'bottom bottom', scrub: 0.6 },
    });
  }
  const rule = $('[data-foot-rule]', foot);
  if (rule) onReveal(rule, () => gsap.to(rule, { scaleX: 1, duration: 1.4, ease: 'power3.inOut', onComplete: () => foot.classList.add('is-drawn') }), 'top 98%');
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initRequestModal();
  window.addEventListener('request:open', () => {
    modalOpen = true;
    root.classList.add('q1-modal');
    lenis?.stop();
    sleep();
  });
  window.addEventListener('request:close', () => {
    modalOpen = false;
    root.classList.remove('q1-modal');
    lenis?.start();
    wake();
  });

  if (motion) {
    lenis = new Lenis({ lerp: 0.1, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$<HTMLAnchorElement>('a[href="#top"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (!lenis) return;
      e.preventDefault();
      lenis.scrollTo(0, { duration: 1.2 });
    }),
  );

  initRigs();
  initCover();
  initHud();
  layoutLeaders();
  fitWord();
  document.fonts?.ready.then(fitWord);
  let rz = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => {
      layoutLeaders();
      fitWord();
    });
  });
  // in-page links in the footer index glide with Lenis, clearing the fixed header
  $$<HTMLAnchorElement>('[data-foot-link]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href') || '';
      const el = id.length > 1 ? document.querySelector<HTMLElement>(id) : null;
      if (!lenis || !el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: id === '#shift' ? 0 : -($('[data-hud]')?.offsetHeight ?? 0), duration: 1.4 });
    }),
  );

  if (!motion) return;

  for (const fn of [initFlow, initDividers, initStats, initSky, initReveals, initFoot]) {
    try {
      fn();
    } catch (err) {
      console.info('[v4a-nearcon-2a] section motion skipped:', err);
    }
  }
  const tl = gsap.timeline();
  heroIntro(tl);
  wake();

  const start = () => {
    layoutLeaders();
    fitWord();
    ScrollTrigger.refresh();
    checkPendingReveals();
  };
  (document.fonts?.ready ?? Promise.resolve()).then(start);
  window.addEventListener('load', start, { once: true });
}

try {
  boot();
} catch (err) {
  root.classList.remove('q1-motion');
  console.info('[v4a-nearcon-2a] boot failed, static page shown.', err);
}
window.__q1ready = true;
