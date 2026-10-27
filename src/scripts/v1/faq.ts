import gsap from 'gsap';

// Smooth height animation for <details> accordions. Native behaviour is kept
// when reduced motion is on (and when JS is off).
export function initFaq(reduce: boolean) {
  if (reduce) return;
  document.querySelectorAll<HTMLDetailsElement>('[data-qa]').forEach((d) => {
    const summary = d.querySelector('summary');
    const panel = d.querySelector<HTMLElement>('[data-qa-panel]');
    if (!summary || !panel) return;
    let closing = false;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      gsap.killTweensOf(panel);
      if (d.open && !closing) {
        closing = true;
        gsap.fromTo(
          panel,
          { height: panel.offsetHeight, opacity: 1 },
          {
            height: 0,
            opacity: 0,
            duration: 0.5,
            ease: 'expo.inOut',
            onComplete: () => {
              d.open = false;
              closing = false;
              gsap.set(panel, { clearProps: 'height,opacity' });
            },
          },
        );
      } else {
        closing = false;
        const from = d.open ? panel.offsetHeight : 0;
        d.open = true;
        gsap.fromTo(
          panel,
          { height: from, opacity: 0 },
          {
            height: 'auto',
            opacity: 1,
            duration: 0.7,
            ease: 'expo.out',
            onComplete: () => {
              gsap.set(panel, { clearProps: 'height,opacity' });
            },
          },
        );
      }
    });
  });
}
