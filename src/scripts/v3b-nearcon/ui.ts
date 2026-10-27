// Request-modal choreography for v3B-NEARCON (fork of v3b/ui.ts, menu removed).
import gsap from 'gsap';
import type Lenis from 'lenis';
import { $, $$, decrypt, reduceMotion, BLOCKS, rand } from '../v3/util';

/* ---------------- request modal choreography ---------------- */
export function initModalFx(getLenis: () => Lenis | null, pauseScene: (p: boolean) => void) {
  const modal = $('[data-request-modal]');
  if (!modal) return;
  const panel = $('[data-rq-panel]', modal)!;
  const form = $<HTMLFormElement>('form[data-request-form]', modal)!;
  const fields = $('[data-rq-fields]', modal)!;
  const seal = $('[data-rq-seal]', modal)!;
  const success = $('[data-request-success]', modal)!;
  let from: DOMRect | null = null;

  document.addEventListener(
    'click',
    (e) => {
      const t = (e.target as Element).closest?.('[data-open-request]');
      if (t) from = t.getBoundingClientRect();
    },
    true,
  );

  window.addEventListener('request:open', () => {
    getLenis()?.stop();
    pauseScene(true);
    if (reduceMotion) return;
    const pr = panel.getBoundingClientRect();
    const r = from ?? new DOMRect(pr.left + pr.width / 2, pr.top + pr.height / 2, 0, 0);
    // inset() relative to the panel box, clamped to it
    const top = Math.max(0, r.top - pr.top);
    const leftI = Math.max(0, Math.min(pr.width - 40, r.left - pr.left));
    const right = Math.max(0, pr.right - r.right);
    const bottom = Math.max(0, pr.bottom - r.bottom);
    gsap.fromTo(
      panel,
      { clipPath: `inset(${top}px ${Math.min(right, pr.width - leftI - 40)}px ${bottom}px ${leftI}px round 0px)` },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: 0.7, ease: 'power4.inOut', clearProps: 'clipPath' },
    );
    gsap.fromTo(
      $$('.rq__head, .rq__title, .rq__intro, .rq__form > *', panel),
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.05, delay: 0.35, clearProps: 'opacity,transform' },
    );
  });
  window.addEventListener('request:close', () => {
    pauseScene(false);
    if (!document.documentElement.classList.contains('menu-open')) getLenis()?.start();
  });

  form.addEventListener('submit', () => {
    // request-modal.ts has already validated and flagged [data-sent]
    if (!form.hasAttribute('data-sent')) return;
    if (reduceMotion) {
      fields.hidden = true;
      return;
    }
    gsap.set(success, { opacity: 0 });
    const inputs = $$<HTMLInputElement>('.field__in', form);
    const real = inputs.map((i) => i.value);
    const st = { p: 0 };
    const tl = gsap.timeline();
    tl.to(st, {
      p: 1,
      duration: 0.4,
      ease: 'none',
      onUpdate: () => inputs.forEach((i, k) => (i.value = real[k].replace(/\S/g, () => rand(BLOCKS)))),
    })
      .to(fields, { height: 0, opacity: 0, y: -24, duration: 0.6, ease: 'power4.inOut' })
      .to(seal, { scaleX: 1, duration: 0.6, ease: 'expo.inOut' }, '<0.1')
      .add(() => {
        inputs.forEach((i, k) => (i.value = real[k]));
        fields.hidden = true;
        gsap.set(success, { opacity: 1 });
        decrypt(success, { duration: 0.6 });
      });
  });
}
