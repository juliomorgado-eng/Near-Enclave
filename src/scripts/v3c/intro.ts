// Preloader (~1 s, ≤0.4 s on repeat visits): the primitive line draws, then the two
// ledgers part along it and the hero emerges from the line.
import gsap from 'gsap';
import { $, $$ } from '../v3/util';

export type IntroHooks = {
  ready: Promise<unknown>;
  splitAt: () => { wide: boolean; y: number };
  onPart: () => void;
  onHero: (tl: gsap.core.Timeline, at: number) => void;
};

export function runIntro(h: IntroHooks): Promise<void> {
  const root = document.documentElement;
  const loader = $('[data-loader]');
  const short = root.classList.contains('v3c-intro-short');
  const finish = () => {
    loader?.remove();
    root.classList.remove('v3c-intro-long', 'v3c-intro-short');
    try {
      sessionStorage.setItem('v3c-intro', '1');
    } catch {
      /* private mode */
    }
  };
  if (!loader) {
    const tl = gsap.timeline();
    h.onPart();
    h.onHero(tl, 0);
    finish();
    return Promise.resolve();
  }

  const a = $('[data-ld-a]', loader)!;
  const b = $('[data-ld-b]', loader)!;
  const line = $('[data-ld-line]', loader)!;
  const labels = $$('[data-ld-t]', loader);
  const { wide, y } = h.splitAt();
  // on narrow screens the line sits where the hero's split will be, so the hand-off is seamless
  if (!wide) {
    a.style.bottom = `${innerHeight - y}px`;
    b.style.top = `${y}px`;
    line.style.top = `${y - 0.5}px`;
  }
  const scaleKey = wide ? 'scaleY' : 'scaleX';

  return new Promise<void>((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      finish();
      resolve();
    };
    const draw = short ? 0.1 : 0.36;
    const tl = gsap.timeline({ onComplete: end });
    tl.to(line, { [scaleKey]: 1, duration: draw, ease: 'expo.inOut' }, 0);
    if (!short) tl.fromTo(labels, { opacity: 0 }, { opacity: 1, duration: 0.25, stagger: 0.06 }, 0.12);
    // wait for fonts (capped) before parting
    tl.addPause(draw, () => {
      Promise.race([h.ready.catch(() => 0), new Promise((r) => setTimeout(r, short ? 20 : 160))]).then(() => tl.resume());
    });
    const at = draw + 0.02;
    const PD = short ? 0.28 : 0.5;
    tl.add(() => h.onPart(), at);
    tl.to(a, wide ? { xPercent: -100, duration: PD, ease: 'expo.inOut' } : { yPercent: -100, duration: PD, ease: 'expo.inOut' }, at);
    tl.to(b, wide ? { xPercent: 100, duration: PD, ease: 'expo.inOut' } : { yPercent: 100, duration: PD, ease: 'expo.inOut' }, at);
    tl.to(line, { opacity: 0, duration: 0.3 }, at + PD * 0.5);
    tl.set(loader, { pointerEvents: 'none' }, at + 0.05);
    tl.add(() => loader.remove(), at + PD + 0.02);
    h.onHero(tl, at + (short ? 0.05 : 0.12));
    const skip = () => {
      if (tl.progress() < 1) tl.timeScale(4);
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('wheel', skip, { once: true, passive: true });
    window.addEventListener('touchstart', skip, { once: true, passive: true });
    setTimeout(end, 3000);
  });
}
