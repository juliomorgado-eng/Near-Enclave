// Preloader (~1 s, ≤ 0.4 s on repeat visits): ciphertext → decrypt → curtain lifts.
import gsap from 'gsap';
import { $, HEX, rand } from '../v3/util';

const TITLE = 'NEAR ENCLAVE 2027';

export type IntroHooks = {
  ready: Promise<unknown>;
  onReveal: () => void;
  onHero: (tl: gsap.core.Timeline, at: number) => void;
};

export function runIntro(hooks: IntroHooks): Promise<void> {
  const root = document.documentElement;
  const loader = $('[data-loader]');
  const short = root.classList.contains('v3b-intro-short');

  const finish = () => {
    loader?.remove();
    root.classList.remove('v3b-intro-long', 'v3b-intro-short');
    try {
      sessionStorage.setItem('v3b-intro', '1');
    } catch {
      /* private mode */
    }
  };

  if (!loader) {
    const tl = gsap.timeline();
    hooks.onReveal();
    hooks.onHero(tl, 0);
    finish();
    return Promise.resolve();
  }

  const cipher = $('[data-ld-cipher]', loader)!;
  const rule = $('[data-ld-rule]', loader)!;
  const hex = () => TITLE.split('').map((c) => (c === ' ' ? ' ' : rand(HEX))).join('');
  cipher.textContent = hex();
  let decrypting = false;
  const iv = window.setInterval(() => {
    if (!decrypting) cipher.textContent = hex();
  }, 60);

  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      window.clearInterval(iv);
      finish();
      resolve();
    };
    const minT = short ? 0 : 200;
    const cap = short ? 150 : 450;
    const gate = Promise.race([
      Promise.all([hooks.ready.catch(() => 0), new Promise((r) => setTimeout(r, minT))]),
      new Promise((r) => setTimeout(r, cap)),
    ]);
    gate.then(() => {
      const D = short ? 0.1 : 0.35;
      const OUT = short ? 0.22 : 0.45;
      const tl = gsap.timeline({ onComplete: done });
      const st = { p: 0 };
      tl.add(() => (decrypting = true), 0);
      tl.to(st, {
        p: 1,
        duration: D,
        ease: 'none',
        onUpdate: () => {
          const n = TITLE.length;
          const cut = st.p * (n + 2);
          let out = '';
          for (let i = 0; i < n; i++) {
            const c = TITLE[i];
            out += c === ' ' ? ' ' : i < cut - 2 ? c : rand(HEX);
          }
          cipher.textContent = out;
        },
        onComplete: () => (cipher.textContent = TITLE),
      }, 0);
      tl.to(rule, { scaleX: 1, duration: D, ease: 'power2.inOut' }, 0);
      tl.add(() => hooks.onReveal(), D);
      tl.to(loader, { yPercent: -100, duration: OUT, ease: 'power3.inOut' }, D);
      tl.set(loader, { pointerEvents: 'none' }, D);
      hooks.onHero(tl, D + OUT * 0.35);
      // the curtain is gone once it has lifted; hero tweens keep running on the timeline
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
