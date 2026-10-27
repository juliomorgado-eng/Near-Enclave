// Preloader (~1 s, ≤ 0.4 s on repeat visits): NEAR wordmark + NEARCON rule → curtain lifts.
import gsap from 'gsap';
import { $ } from '../v3/util';

export type IntroHooks = {
  ready: Promise<unknown>;
  onReveal: () => void;
  onHero: (tl: gsap.core.Timeline, at: number) => void;
};

export function runIntro(hooks: IntroHooks): Promise<void> {
  const root = document.documentElement;
  const loader = $('[data-loader]');
  const short = root.classList.contains('vnc-intro-short');

  const finish = () => {
    loader?.remove();
    root.classList.remove('vnc-intro-long', 'vnc-intro-short');
    try {
      sessionStorage.setItem('vnc-intro', '1');
    } catch {
      /* private mode */
    }
  };

  if (!loader || !(root.classList.contains('vnc-intro-long') || short)) {
    const tl = gsap.timeline();
    hooks.onReveal();
    hooks.onHero(tl, 0);
    finish();
    return Promise.resolve();
  }

  const rule = $('[data-ld-rule]', loader)!;
  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      finish();
      resolve();
    };
    const minT = short ? 0 : 250;
    const cap = short ? 150 : 450;
    const gate = Promise.race([
      Promise.all([hooks.ready.catch(() => 0), new Promise((r) => setTimeout(r, minT))]),
      new Promise((r) => setTimeout(r, cap)),
    ]);
    gate.then(() => {
      const D = short ? 0.1 : 0.4;
      const OUT = short ? 0.22 : 0.45;
      const tl = gsap.timeline({ onComplete: done });
      tl.to(rule, { scaleX: 1, duration: D, ease: 'power2.inOut' }, 0);
      tl.add(() => hooks.onReveal(), D);
      tl.to(loader, { yPercent: -100, duration: OUT, ease: 'power3.inOut' }, D);
      tl.set(loader, { pointerEvents: 'none' }, D);
      hooks.onHero(tl, D + OUT * 0.35);
      tl.add(finish, D + OUT);
      const skip = () => {
        if (tl.progress() < 1) tl.timeScale(4);
      };
      loader.addEventListener('click', skip, { once: true });
      window.addEventListener('keydown', skip, { once: true });
      window.addEventListener('wheel', skip, { once: true, passive: true });
      window.addEventListener('touchstart', skip, { once: true, passive: true });
    });
    setTimeout(done, 3000);
  });
}
