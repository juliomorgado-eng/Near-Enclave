// Preloader: hex ciphertext → decrypt → vault-door split → hero rises.
import gsap from 'gsap';
import { $, $$, HEX, rand } from './util';

const TITLE = 'NEAR ENCLAVE 2027';

export type IntroHooks = {
  ready: Promise<unknown>; // fonts / textures / shader compile
  progress: () => number; // 0..1 real loading progress
  onSplit: () => void; // canvas + hero reveal start
  onHero: (tl: gsap.core.Timeline, at: number) => void;
};

export function runIntro(hooks: IntroHooks): Promise<void> {
  const root = document.documentElement;
  const loader = $('[data-loader]');
  const short = root.classList.contains('v3-intro-short');

  const finish = () => {
    loader?.remove();
    root.classList.remove('v3-intro-long', 'v3-intro-short');
    try {
      sessionStorage.setItem('v3-intro', '1');
    } catch {
      /* private mode */
    }
  };

  if (!loader) {
    const tl = gsap.timeline();
    hooks.onSplit();
    hooks.onHero(tl, 0);
    finish();
    return Promise.resolve();
  }

  const ciphers = $$('[data-ld-cipher]', loader);
  const counts = $$('[data-ld-count]', loader);
  const rules = $$('[data-ld-rule]', loader);
  const top = $('.ld__half--t', loader)!;
  const bot = $('.ld__half--b', loader)!;

  const hex = () =>
    TITLE.split('')
      .map((c) => (c === ' ' ? '·' : rand(HEX)))
      .join('');
  const setCipher = (s: string) => ciphers.forEach((c) => (c.textContent = s));
  setCipher(hex());

  // 1) ciphertext + counter, re-randomised every 50 ms
  let shown = 0;
  const t0 = performance.now();
  const minT = short ? 250 : 1400;
  const iv = window.setInterval(() => {
    if (!decrypting) setCipher(hex());
    const timeP = Math.min(1, (performance.now() - t0) / minT);
    shown = Math.max(shown, Math.min(timeP, hooks.progress()));
    counts.forEach((c) => (c.textContent = String(Math.round(shown * 100)).padStart(3, '0')));
  }, 50);
  let decrypting = false;

  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      window.clearInterval(iv);
      finish();
      resolve();
    };

    // wait for readiness, but never more than a hard cap
    const cap = short ? 500 : 2200;
    const gate = Promise.race([
      Promise.all([hooks.ready.catch(() => 0), new Promise((r) => setTimeout(r, minT))]),
      new Promise((r) => setTimeout(r, cap)),
    ]);

    gate.then(() => {
      shown = 1;
      counts.forEach((c) => (c.textContent = '100'));
      const D = short ? 0.28 : 0.6;
      const tl = gsap.timeline({ onComplete: done });

      // 2) decrypt left → right, each char cycles 3 glyphs then settles
      const st = { p: 0 };
      tl.add(() => {
        decrypting = true;
      }, 0);
      tl.to(
        st,
        {
          p: 1,
          duration: D,
          ease: 'none',
          onUpdate: () => {
            const n = TITLE.length;
            const cut = st.p * (n + 3);
            let out = '';
            for (let i = 0; i < n; i++) {
              const c = TITLE[i];
              if (i < cut - 3) out += c;
              else if (i < cut) out += c === ' ' ? ' ' : rand(HEX);
              else out += c === ' ' ? '·' : rand(HEX);
            }
            setCipher(out);
          },
          onComplete: () => setCipher(TITLE),
        },
        0,
      );
      tl.to(rules, { scaleX: 1, duration: D, ease: 'expo.inOut' }, 0);

      // 3) vault door: halves slide 50vh apart
      const split = D + (short ? 0.05 : 0.0);
      const SD = short ? 0.7 : 1.0;
      tl.add(() => hooks.onSplit(), split);
      tl.to(top, { yPercent: -50, duration: SD, ease: 'expo.inOut' }, split);
      tl.to(bot, { yPercent: 50, duration: SD, ease: 'expo.inOut' }, split);
      tl.set(loader, { pointerEvents: 'none' }, split + 0.1);

      // 4) hero
      hooks.onHero(tl, split + (short ? 0.15 : 0.2));
      tl.add(() => root.classList.remove('v3-intro-long', 'v3-intro-short'), split + 0.3);
      tl.add(() => loader.remove(), split + SD);

      // skippable
      const skip = () => {
        if (tl.progress() < 1) tl.timeScale(5);
      };
      loader.addEventListener('click', skip, { once: true });
      window.addEventListener('keydown', skip, { once: true });
      window.addEventListener('wheel', skip, { once: true, passive: true });
      window.addEventListener('touchstart', skip, { once: true, passive: true });
    });

    // absolute failsafe: never trap the page
    setTimeout(done, 6000);
  });
}
