import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => c.querySelector<T>(s);
export const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document) => [...c.querySelectorAll<T>(s)];

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isTouch = !finePointer;

export const CIPHER = '01$#/\\+×N≡<>%';
export const BLOCKS = '░▒▓#$01/';
export const HEX = '0123456789ABCDEF';

export const rand = (s: string) => s[(Math.random() * s.length) | 0];

/**
 * Left→right decrypt. Spaces keep their position so line breaks never change.
 * Returns a tween; final text is always restored on complete/kill.
 */
export function decrypt(
  el: HTMLElement,
  opts: { text?: string; duration?: number; chars?: string; delay?: number; cycles?: number } = {},
) {
  const text = opts.text ?? el.dataset.text ?? el.textContent ?? '';
  el.dataset.text = text;
  const chars = opts.chars ?? CIPHER;
  const state = { p: 0 };
  let tick = 0;
  const render = () => {
    tick++;
    const cut = Math.floor(state.p * text.length);
    let out = text.slice(0, cut);
    for (let i = cut; i < text.length; i++) {
      const ch = text[i];
      out += /\s/.test(ch) ? ch : i < cut + 3 || tick % 2 === 0 ? rand(chars) : (el.textContent?.[i] ?? rand(chars));
    }
    el.textContent = out;
  };
  const restore = () => {
    el.textContent = text;
    el.dataset.text = text;
  };
  return gsap.to(state, {
    p: 1,
    duration: opts.duration ?? 0.6,
    delay: opts.delay ?? 0,
    ease: 'none',
    onStart: render,
    onUpdate: render,
    onComplete: restore,
    onInterrupt: restore,
  });
}

/**
 * Run `fn` once when `el` reaches `start` — also if the page was loaded already
 * scrolled past it, so nothing can stay in its hidden initial state.
 */
const pending: Array<() => void> = [];
export function onReveal(el: Element, fn: () => void, start = 'top 88%') {
  let done = false;
  let st: ScrollTrigger | null = null;
  const run = () => {
    if (done) return;
    done = true;
    // ScrollTrigger may fire onEnter synchronously inside create(); kill once assigned
    if (st) st.kill();
    else requestAnimationFrame(() => st?.kill());
    try {
      fn();
    } catch {
      /* a failed reveal must never leave the page locked */
    }
  };
  st = ScrollTrigger.create({ trigger: el, start, onEnter: run, onEnterBack: run });
  if (done) st.kill();
  const check = () => {
    if (!done && st && st.scroll() >= st.start) run();
  };
  pending.push(check);
  requestAnimationFrame(check);
}
export function checkPendingReveals() {
  pending.forEach((c) => c());
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Document Y to scroll to for a section — pinned sections resolve to their pin-spacer start. */
export function scrollTargetY(el: HTMLElement) {
  const sp = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el.closest<HTMLElement>('.pin-spacer');
  const box = sp ?? el;
  return Math.max(0, box.getBoundingClientRect().top + window.scrollY);
}
