// Menu overlay + modal pause hooks.
import gsap from 'gsap';
import type Lenis from 'lenis';
import { $, $$, reduceMotion, scrollTargetY } from '../v3/util';

export function initMenu(getLenis: () => Lenis | null) {
  const menu = $('[data-menu]');
  const openBtn = $('[data-menu-open]');
  if (!menu || !openBtn) return;
  const links = $$<HTMLAnchorElement>('[data-menu-link]', menu);
  const labels = $$('.menu__label', menu);
  let isOpen = false;
  let tl: gsap.core.Timeline | null = null;

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    menu.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    getLenis()?.stop();
    document.documentElement.classList.add('menu-open');
    tl?.kill();
    if (reduceMotion) {
      menu.setAttribute('data-open', '');
    } else {
      tl = gsap.timeline();
      tl.fromTo(menu, { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'expo.inOut' })
        .fromTo(labels, { yPercent: 105 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, 0.3)
        .add(() => menu.setAttribute('data-open', ''));
    }
    setTimeout(() => links[0]?.focus({ preventScroll: true }), 80);
  };

  const close = (returnFocus = true) => {
    if (!isOpen) return;
    isOpen = false;
    openBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('menu-open');
    menu.removeAttribute('data-open');
    tl?.kill();
    const end = () => {
      menu.hidden = true;
      gsap.set(menu, { clearProps: 'clipPath' });
      if (!document.querySelector('[data-request-modal][data-open]')) getLenis()?.start();
    };
    if (reduceMotion) end();
    else gsap.to(menu, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.55, ease: 'expo.inOut', onComplete: end });
    if (returnFocus) openBtn.focus({ preventScroll: true });
  };

  openBtn.addEventListener('click', () => (isOpen ? close() : open()));
  $$('[data-menu-close]', menu).forEach((b) => b.addEventListener('click', () => close()));
  $$('[data-menu-close-silent]', menu).forEach((b) => b.addEventListener('click', () => close(false)));
  links.forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href') || '';
      const target = id.length > 1 ? document.querySelector<HTMLElement>(id) : null;
      if (!target) return;
      e.preventDefault();
      close(false);
      const lenis = getLenis();
      setTimeout(() => {
        const y = id === '#top' ? 0 : scrollTargetY(target);
        if (lenis) {
          lenis.start();
          lenis.scrollTo(y, { duration: 1.4 });
        } else window.scrollTo(0, y);
        history.replaceState(null, '', id);
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 300);
    }),
  );

  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = $$<HTMLElement>('a[href], button:not([disabled])', menu).filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
