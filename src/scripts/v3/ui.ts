// Global UI: clock, grain, HUD label, menu overlay, cursor + magnetics, FAQ, modal choreography.
import gsap from 'gsap';
import type Lenis from 'lenis';
import { $, $$, decrypt, finePointer, reduceMotion, BLOCKS, rand, scrollTargetY } from './util';

/* ---------------- clock ---------------- */
export function initClock() {
  const els = $$('[data-clock]');
  if (!els.length) return;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
  } catch {
    return;
  }
  const tick = () => {
    const parts = fmt.formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const h = get('hour') === '24' ? '00' : get('hour');
    const s = `NYC ${h}:${get('minute')}:${get('second')} ${get('timeZoneName')}`;
    els.forEach((e) => (e.textContent = s));
  };
  tick();
  window.setInterval(tick, 1000);
}

/* ---------------- grain ---------------- */
export function initGrain() {
  const el = $('[data-grain]');
  if (!el) return;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    el.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  } catch {
    el.remove();
  }
}

/* ---------------- HUD label ---------------- */
let hudTween: gsap.core.Tween | null = null;
let hudText = '';
export function setHudLabel(text: string) {
  const el = $('[data-hud-label]');
  if (!el || hudText === text) return;
  hudText = text;
  // kill the running decrypt (it animates a state object, not the element)
  hudTween?.kill();
  hudTween = null;
  if (reduceMotion) {
    el.dataset.text = text;
    el.textContent = text;
    return;
  }
  hudTween = decrypt(el, { text, duration: 0.3 });
}

/* ---------------- menu ---------------- */
export function initMenu(getLenis: () => Lenis | null) {
  const menu = $('[data-menu]');
  const openBtn = $('[data-menu-open]');
  if (!menu || !openBtn) return;
  const links = $$<HTMLAnchorElement>('[data-menu-link]', menu);
  const labels = $$('.menu__label', menu);
  const idx = $$('.menu__idx', menu);
  const foot = $('.menu__foot', menu);
  const img = $<HTMLImageElement>('[data-menu-img]', menu);
  let isOpen = false;
  let tl: gsap.core.Timeline | null = null;

  const setOrigin = () => {
    const r = openBtn.getBoundingClientRect();
    menu.style.setProperty('--cx', `${r.left + r.width / 2}px`);
    menu.style.setProperty('--cy', `${r.top + r.height / 2}px`);
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    setOrigin();
    menu.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    getLenis()?.stop();
    document.documentElement.classList.add('menu-open');
    tl?.kill();
    if (reduceMotion) {
      menu.setAttribute('data-open', '');
      gsap.set(menu, { clipPath: 'none', opacity: 0 });
      gsap.to(menu, { opacity: 1, duration: 0.2 });
    } else {
      const cx = menu.style.getPropertyValue('--cx');
      const cy = menu.style.getPropertyValue('--cy');
      tl = gsap.timeline();
      tl.fromTo(
        menu,
        { clipPath: `circle(0% at ${cx} ${cy})` },
        { clipPath: `circle(150% at ${cx} ${cy})`, duration: 0.9, ease: 'power4.inOut' },
      )
        .fromTo(
          labels,
          { yPercent: 105, '--mw': 62 },
          { yPercent: 0, '--mw': 112, duration: 1.0, ease: 'expo.out', stagger: 0.05 },
          0.3,
        )
        .fromTo(idx, { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.05 }, 0.5)
        .fromTo(foot, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 0.6)
        .add(() => {
          gsap.set(labels, { clearProps: '--mw' });
        });
    }
    setTimeout(() => links[0]?.focus({ preventScroll: true }), 80);
  };

  const close = (returnFocus = true) => {
    if (!isOpen) return;
    isOpen = false;
    openBtn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('menu-open');
    tl?.kill();
    const end = () => {
      menu.hidden = true;
      gsap.set(menu, { clearProps: 'clipPath,opacity' });
      if (!document.querySelector('[data-request-modal][data-open]')) getLenis()?.start();
    };
    if (reduceMotion) {
      gsap.to(menu, { opacity: 0, duration: 0.2, onComplete: end });
    } else {
      setOrigin();
      const cx = menu.style.getPropertyValue('--cx');
      const cy = menu.style.getPropertyValue('--cy');
      gsap.to(menu, { clipPath: `circle(0% at ${cx} ${cy})`, duration: 0.7, ease: 'power4.inOut', onComplete: end });
    }
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
        const y = scrollTargetY(target);
        if (lenis) {
          lenis.start();
          lenis.scrollTo(y, { duration: 1.4 });
        } else window.scrollTo(0, y);
        history.replaceState(null, '', id);
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 350);
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

  // hover photo following the cursor
  if (img && finePointer && !reduceMotion) {
    const xTo = gsap.quickTo(img, 'x', { duration: 0.6, ease: 'expo.out' });
    const yTo = gsap.quickTo(img, 'y', { duration: 0.6, ease: 'expo.out' });
    const rTo = gsap.quickTo(img, 'rotation', { duration: 0.8, ease: 'expo.out' });
    let lx = 0;
    menu.addEventListener('pointermove', (e) => {
      xTo(e.clientX + 32);
      yTo(e.clientY - 94);
      rTo(gsap.utils.clamp(-3, 3, (e.clientX - lx) * 0.4));
      lx = e.clientX;
    });
    links.forEach((a) => {
      a.addEventListener('pointerenter', () => {
        const src = a.dataset.img;
        if (src && img.getAttribute('src') !== src) img.src = src;
        gsap.to(img, { opacity: 1, scale: 1, duration: 0.4, ease: 'expo.out' });
      });
      a.addEventListener('pointerleave', () => gsap.to(img, { opacity: 0, scale: 0.92, duration: 0.3 }));
    });
  }
}

/* ---------------- cursor ---------------- */
export function initCursor(onMove: (x: number, y: number) => void) {
  const root = $('[data-cursor-root]');
  if (!root || !finePointer) return;
  document.documentElement.classList.add('has-cursor');
  const dot = $('[data-cursor-dot]', root)!;
  const ring = $('[data-cursor-ring]', root)!;
  const label = $('[data-cursor-label]', root)!;
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const rp = { x: pos.x, y: pos.y };
  root.classList.add('is-out');

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      pos.x = e.clientX;
      pos.y = e.clientY;
      root.classList.remove('is-out');
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      onMove(pos.x, pos.y);
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => root.classList.add('is-out'));
  gsap.ticker.add(() => {
    rp.x += (pos.x - rp.x) * 0.18;
    rp.y += (pos.y - rp.y) * 0.18;
    ring.style.transform = `translate3d(${rp.x}px, ${rp.y}px, 0)`;
  });

  const INTERACTIVE = 'a, button, summary, label, [data-cursor]';
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    if (t.closest('input[type="text"], input[type="email"], textarea, select')) {
      root.classList.add('is-text');
      root.classList.remove('is-hover');
      return;
    }
    root.classList.remove('is-text');
    const el = t.closest<HTMLElement>(INTERACTIVE);
    if (el) {
      const l = el.dataset.cursor || (el.tagName === 'A' ? 'OPEN' : el.tagName === 'SUMMARY' ? 'READ' : 'SELECT');
      label.textContent = l;
      root.classList.add('is-hover');
    } else root.classList.remove('is-hover');
  });
  window.addEventListener('pointerdown', () => gsap.fromTo(ring, { scale: 0.86 }, { scale: 1, duration: 0.5, ease: 'expo.out' }));

  // magnetic buttons
  $$('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    let inside = false;
    window.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const reach = 80;
        const near = Math.abs(dx) < r.width / 2 + reach && Math.abs(dy) < r.height / 2 + reach;
        if (near) {
          inside = true;
          xTo(dx * 0.3);
          yTo(dy * 0.3);
        } else if (inside) {
          inside = false;
          gsap.to(el, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.4)', overwrite: true });
        }
      },
      { passive: true },
    );
  });
}

/* ---------------- FAQ ---------------- */
export function initFaq() {
  $$<HTMLDetailsElement>('[data-qa]').forEach((d) => {
    const summary = $('summary', d)!;
    const panel = $('[data-qa-panel]', d)!;
    const text = $('[data-qa-text]', d);
    if (reduceMotion) return;
    let busy = false;
    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      if (!d.open) {
        d.open = true;
        gsap.fromTo(
          panel,
          { height: 0 },
          { height: 'auto', duration: 0.6, ease: 'expo.out', onComplete: () => { busy = false; panel.style.height = ''; } },
        );
        if (text) decrypt(text, { duration: 0.25 });
      } else {
        gsap.to(panel, {
          height: 0,
          duration: 0.45,
          ease: 'power3.inOut',
          onComplete: () => {
            d.open = false;
            panel.style.height = '';
            busy = false;
          },
        });
      }
    });
  });
}

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
      { clipPath: `inset(${top}px ${Math.min(right, pr.width - leftI - 40)}px ${bottom}px ${leftI}px round 28px)` },
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
