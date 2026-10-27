// Per-section choreography. Each section owns one signature motion; the rest stays still.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type Lenis from 'lenis';
import { $, $$, decrypt, onReveal, rand, BLOCKS, CIPHER, clamp, finePointer } from './util';
import type { Scene } from './scene';

export const live = { shiftP: 0, closeP: 0, intro: 1 };

/* ---------- shared reveals ---------- */
function lineReveal(el: HTMLElement) {
  gsap.set(el, { visibility: 'visible' });
  const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'rl' });
  gsap.from(split.lines, {
    yPercent: 112,
    duration: 1.15,
    ease: 'expo.out',
    stagger: 0.08,
    onComplete: () => split.revert(),
    onInterrupt: () => split.revert(),
  });
}

export function initReveals() {
  $$('[data-lines]').forEach((el) => onReveal(el, () => lineReveal(el), 'top 88%'));
  $$('[data-fade]').forEach((el) =>
    onReveal(el, () => gsap.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'transform' }), 'top 92%'),
  );
  const foot = $('[data-foot-mega]');
  if (foot) {
    onReveal(
      foot,
      () => gsap.to($$('[data-foot-ch]', foot), { y: 0, yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05 }),
      'top 95%',
    );
  }
}

/* ---------- theme + HUD ---------- */
export function initThemes(setLabel: (s: string) => void) {
  const secs = $$('[data-theme]').filter((s) => s !== document.body);
  const items = secs.map((s, i) => ({
    s,
    theme: s.dataset.theme!,
    label: `§${String(i + 1).padStart(2, '0')} ${s.dataset.hud ?? ''}`,
    st: ScrollTrigger.create({ trigger: s, start: 'top 50%', end: 'bottom 50%' }),
  }));
  let label = '';
  // Derived from the current scroll position every frame, so jumps, reloads and
  // programmatic scrolls (menu, anchors) can never leave a stale theme or label.
  const sync = () => {
    if (!items.length) return;
    const y = window.scrollY;
    let pick = items[0];
    for (const it of items) if (y >= it.st.start) pick = it;
    let theme = pick.theme;
    // the closing chapter turns cream once its light has flooded the frame
    if (pick.s.id === 'request' && live.closeP > 0.72) theme = 'cream';
    if (document.body.dataset.theme !== theme) document.body.dataset.theme = theme;
    if (pick.label !== label) {
      label = pick.label;
      setLabel(label);
    }
  };
  ScrollTrigger.addEventListener('refresh', sync);
  sync();
  return sync;
}

/* ---------- hero ---------- */
export function heroReveal(tl: gsap.core.Timeline, at: number) {
  const lines = $$('[data-hero-line]');
  const kicker = $('[data-hero-kicker]');
  tl.to(lines, { y: 0, yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, at);
  if (kicker) {
    tl.set(kicker, { opacity: 1 }, at);
    tl.add(() => decrypt(kicker, { duration: 0.6 }), at);
  }
  tl.fromTo('[data-hero-fade]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, at + 0.15);
  tl.fromTo('[data-hero-cta]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, at + 0.4);
  tl.fromTo(live, { intro: 0 }, { intro: 1, duration: 1.4, ease: 'expo.out' }, at - 0.2);
}

export function initHero() {
  const pm = $('[data-hover-scramble]');
  if (pm && finePointer) {
    let busy = false;
    pm.addEventListener('pointerenter', () => {
      if (busy) return;
      busy = true;
      decrypt(pm, { duration: 0.55, chars: CIPHER }).eventCallback('onComplete', () => {
        pm.textContent = pm.dataset.text ?? pm.textContent;
        busy = false;
      });
    });
  }
  gsap.to('.hero__title', {
    yPercent: -14,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

/* ---------- shift ---------- */
type CharState = { el: HTMLElement; ch: string; settled: boolean };
function charDecrypter(h2: HTMLElement) {
  let chars: CharState[] = [];
  const state = { p: 1 };
  let last = -1;
  let frame = 0;
  const collect = (self: SplitText) => {
    chars = (self.chars as HTMLElement[]).map((el) => ({ el, ch: el.textContent ?? '', settled: true }));
    last = -1;
  };
  const split = SplitText.create(h2, {
    type: 'lines,words,chars',
    linesClass: 'split-line',
    charsClass: 'char-d',
    autoSplit: true,
    onSplit: (self) => {
      collect(self);
      render(state.p, true);
    },
  });
  function render(p: number, force = false) {
    frame++;
    const n = chars.length;
    if (!n) return;
    if (!force && p === last && (p >= 1 || frame % 3)) return;
    last = p;
    for (let i = 0; i < n; i++) {
      const c = chars[i];
      if (c.ch.trim() === '') continue;
      const t = (i / n) * 0.75;
      const local = (p - t) / 0.25;
      if (local >= 1) {
        if (!c.settled) {
          c.el.textContent = c.ch;
          c.el.style.fontVariationSettings = '';
          c.settled = true;
        }
      } else {
        if (c.settled || frame % 3 === 0) c.el.textContent = rand(BLOCKS);
        if (c.settled) c.el.style.fontVariationSettings = "'wdth' 62";
        c.settled = false;
      }
    }
  }
  collect(split);
  return { state, render };
}

export function initShift() {
  const sec = $('#shift');
  const h2 = $('[data-decrypt-h2]');
  if (!sec || !h2) return;
  const dec = charDecrypter(h2);
  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    dec.state.p = 0;
    dec.render(0, true);
    gsap.to(dec.state, {
      p: 1,
      ease: 'none',
      onUpdate: () => dec.render(dec.state.p),
      onComplete: () => dec.render(1, true),
      scrollTrigger: { trigger: h2, start: 'top 80%', end: 'top 30%', scrub: 0.8 },
    });

    const s = $$('[data-shift-s]', sec);
    const prim = $('[data-shift-prim]', sec)!;
    const primLine = $('.shift__prim', prim)!;
    const head = [$('.shift__eyebrow', sec)!, h2];
    const echo = $('[data-shift-echo]', sec)!;
    // the full-frame line is transient here, so the inline echo carries the sentence for AT
    prim.setAttribute('aria-hidden', 'true');
    echo.removeAttribute('aria-hidden');
    // item 01 is on screen from the pin start; the rest arrive with the scrub
    gsap.set([...s.slice(1), echo], { opacity: 0, y: 24 });
    gsap.set(prim, { autoAlpha: 0 });
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: '+=200%',
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
      },
      onUpdate() {
        live.shiftP = this.progress();
      },
    });
    tl.to(s[1], { opacity: 1, y: 0, duration: 0.1, ease: 'power2.out' }, 0.25)
      .to(s[0], { opacity: 0.4, duration: 0.08 }, 0.25)
      // 50–75%: the primitive takes the whole frame
      .to([...head, s[0], s[1]], { opacity: 0, duration: 0.05 }, 0.48)
      .to(prim, { autoAlpha: 1, duration: 0.04 }, 0.5)
      .fromTo(primLine, { scale: 0.86, '--pw': 62 }, { scale: 1, '--pw': 112, duration: 0.12, ease: 'power3.out' }, 0.5)
      .to(prim, { autoAlpha: 0, duration: 0.05 }, 0.75)
      .to(head, { opacity: 1, duration: 0.06 }, 0.78)
      .to([s[0], s[1]], { opacity: 0.4, duration: 0.06 }, 0.78)
      .to(echo, { opacity: 1, y: 0, duration: 0.08, ease: 'power2.out' }, 0.78)
      .to(s[2], { opacity: 1, y: 0, duration: 0.1, ease: 'power2.out' }, 0.8)
      .to([s[0], s[1]], { opacity: 1, duration: 0.05 }, 0.95)
      .set({}, {}, 1);
    return () => {
      live.shiftP = 0;
      prim.removeAttribute('aria-hidden');
      echo.setAttribute('aria-hidden', 'true');
    };
  });

  mm.add('(max-width: 1023px)', () => {
    dec.state.p = 0;
    dec.render(0, true);
    onReveal(
      h2,
      () =>
        gsap.to(dec.state, {
          p: 1,
          duration: 0.7,
          ease: 'none',
          onUpdate: () => dec.render(dec.state.p),
          onComplete: () => dec.render(1, true),
        }),
      'top 85%',
    );
    const items = $$('.shift__s', sec);
    items.forEach((el) => {
      gsap.set(el, { opacity: 0, y: 16 });
      onReveal(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }), 'top 90%');
    });
    live.shiftP = 0;
  });
}

/* ---------- stats ---------- */
export function initStats() {
  const mobile = matchMedia('(max-width: 767px)');
  $$('[data-stat]').forEach((row) => {
    const el = $('[data-stat-val]', row)!;
    const { prefix = '', suffix = '', final = '' } = el.dataset;
    const to = parseFloat(el.dataset.number || '0');
    const to2 = el.dataset.numberTo ? parseFloat(el.dataset.numberTo) : null;
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const st = { p: 0 };
    let frame = 0;
    const render = () => {
      const p = st.p;
      const e = 1 - Math.pow(1 - p, 3);
      const maxW = mobile.matches ? 112 : 125;
      el.style.setProperty('--sw', String(62 + (maxW - 62) * e));
      el.style.setProperty('--sg', String(300 + 500 * e));
      if (p >= 0.999) {
        el.textContent = final;
        return;
      }
      frame++;
      const a = to * e;
      const b = to2 !== null ? to2 * e : 0;
      let num = a.toFixed(dec);
      let num2 = to2 !== null ? b.toFixed(dec) : '';
      if (p > 0.001 && frame % 2 === 0) {
        if (to2 !== null) {
          const f = num2.slice(0, -1) + rand('0123456789');
          if (parseFloat(f) >= parseFloat(num)) num2 = f;
        } else num = num.slice(0, -1) + rand('0123456789');
      }
      el.textContent = `${prefix}${num}${to2 !== null ? `–${num2}` : ''}${suffix}`;
    };
    gsap.to(st, {
      p: 1,
      ease: 'none',
      onUpdate: render,
      onComplete: render,
      scrollTrigger: { trigger: row, start: 'top 85%', end: 'top 40%', scrub: 0.8 },
    });
    render();
  });
}

/* ---------- photos (mosaic planes) ---------- */
export function initPlanes(scene: Scene | null) {
  const imgs = $$<HTMLImageElement>('[data-mosaic]');
  imgs.forEach((img, i) => {
    const st = { p: 0 };
    gsap.to(st, {
      p: 1,
      ease: 'none',
      scrollTrigger: { trigger: img, start: 'top 90%', end: i === 0 ? 'center center' : 'top 35%', scrub: 0.6 },
    });
    if (!scene) return;
    const go = () => scene.addPlane(img, () => st.p);
    // load the texture a little before it is needed
    onReveal(img, go, 'top 250%');
  });
}

/* ---------- agenda ---------- */
export function initAgenda(getLenis: () => Lenis | null) {
  const sec = $('#agenda');
  const track = $('[data-agenda-track]');
  if (!sec || !track) return;
  const panels = $$('[data-panel]', sec);
  const ixs = $$<HTMLButtonElement>('[data-agenda-ix]', sec);
  const ul = $('[data-agenda-ul]', sec);
  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    sec.classList.add('is-h');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const len = () => Math.min(dist(), window.innerHeight * 3);
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: () => `+=${len()}`,
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => setIndex(self.progress),
      },
    });
    function setIndex(p: number) {
      const i = Math.min(panels.length - 1, Math.round(p * (panels.length - 1)));
      ixs.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
      panels.forEach((pn, k) => pn.classList.toggle('is-active', k === i));
      if (ul && ixs.length) {
        const f = p * (ixs.length - 1);
        const a = Math.floor(f);
        const b = Math.min(ixs.length - 1, a + 1);
        const t = f - a;
        const ra = ixs[a];
        const rb = ixs[b];
        const x = ra.offsetLeft + (rb.offsetLeft - ra.offsetLeft) * t;
        const w = ra.offsetWidth + (rb.offsetWidth - ra.offsetWidth) * t;
        gsap.set(ul, { x, width: w });
      }
    }
    setIndex(0);
    panels.forEach((pn) => {
      const fill = $('[data-panel-fill]', pn);
      if (!fill) return;
      gsap.fromTo(
        fill,
        { clipPath: 'inset(100% 0% 0% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          ease: 'none',
          scrollTrigger: { trigger: pn, containerAnimation: tween, start: 'left 85%', end: 'left 35%', scrub: true },
        },
      );
    });
    const clicks = ixs.map((b, k) => {
      const fn = () => {
        const st = tween.scrollTrigger!;
        const y = st.start + (st.end - st.start) * (k / (panels.length - 1));
        const lenis = getLenis();
        if (lenis) lenis.scrollTo(y, { duration: 1.2 });
        else window.scrollTo(0, y);
      };
      b.addEventListener('click', fn);
      return fn;
    });
    return () => {
      sec.classList.remove('is-h');
      ixs.forEach((b, k) => b.removeEventListener('click', clicks[k]));
    };
  });

  mm.add('(max-width: 1023px)', () => {
    panels.forEach((pn) => {
      const fill = $('[data-panel-fill]', pn);
      if (!fill) return;
      gsap.fromTo(
        fill,
        { clipPath: 'inset(100% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: pn, start: 'top 80%', end: 'top 30%', scrub: true } },
      );
    });
  });
}

/* ---------- audience ---------- */
export function initAudience() {
  $$('[data-seat]').forEach((row) => {
    const bar = $('[data-seat-bar]', row)!;
    const ul = $('[data-seat-ul]', row)!;
    let flashed = false;
    gsap.fromTo(
      bar,
      { scaleX: 1 },
      {
        scaleX: 0,
        ease: 'power2.inOut',
        scrollTrigger: {
          trigger: row,
          start: 'top 98%',
          end: 'top 78%',
          scrub: 0.6,
        },
        onUpdate() {
          if (!flashed && this.progress() > 0.98) {
            flashed = true;
            gsap.fromTo(
              ul,
              { scaleX: 0, opacity: 1 },
              { scaleX: 1, duration: 0.7, ease: 'expo.out', onComplete: () => { gsap.to(ul, { opacity: 0, duration: 0.6, delay: 0.3 }); } },
            );
          }
        },
      },
    );
  });
}

/* ---------- partners ---------- */
export function initPartners(getLenis: () => Lenis | null) {
  $$('[data-wordmark]').forEach((wm) => {
    const t = $('[data-wm-t]', wm);
    if (!t) return;
    let busy = false;
    wm.addEventListener('pointerenter', () => {
      if (busy) return;
      busy = true;
      const base = parseFloat(getComputedStyle(t).getPropertyValue('--ww')) || 125;
      decrypt(t, { duration: 0.5 });
      gsap.fromTo(
        t,
        { '--ww': base },
        { '--ww': 90, duration: 0.3, ease: 'power2.in', yoyo: true, repeat: 1, onComplete: () => { gsap.set(t, { clearProps: '--ww' }); busy = false; } },
      );
    });
  });

  const rows = $$('[data-marquee-inner]');
  if (!rows.length) return;
  const mq = $('[data-marquee]')!;
  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(mq);
  const xs = rows.map(() => 0);
  let skew = 0;
  gsap.ticker.add((_, dt) => {
    if (!visible) return;
    const v = getLenis()?.velocity ?? 0;
    skew += (clamp(v * 0.25, -4, 4) - skew) * 0.1;
    rows.forEach((r, i) => {
      const dir = i % 2 ? 1 : -1;
      const w = r.scrollWidth / 4;
      xs[i] += dir * (0.04 * dt + Math.abs(v) * 0.4);
      if (xs[i] < -w) xs[i] += w;
      if (xs[i] > 0) xs[i] -= w;
      r.style.transform = `translate3d(${xs[i]}px,0,0) skewX(${skew * dir}deg)`;
    });
  });
}

/* ---------- speakers ---------- */
export function initSpeakers() {
  const sec = $('#speakers');
  const lbls = $$('[data-slot-lbl]');
  if (!sec || !lbls.length) return;
  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(sec);
  window.setInterval(() => {
    if (!visible || document.hidden) return;
    const l = lbls[(Math.random() * lbls.length) | 0];
    decrypt(l, { text: '[ SEALED ]', duration: 0.5, chars: BLOCKS });
  }, 420);
}

/* ---------- closing ---------- */
export function initClosing() {
  const sec = $('#request');
  if (!sec) return;
  const pin = $('[data-closing-pin]', sec)!;
  const titles = $$('[data-closing-title], [data-closing-ink-title]', sec);
  const cta = $$('[data-closing-cta], [data-closing-cta-ink]', sec);
  const state = $('[data-closing-state]', sec)!;
  const clips = $$('[data-closing-flood], [data-closing-ink]', sec);
  const mobile = matchMedia('(max-width: 767px)').matches;
  let open = false;
  gsap.set(cta, { autoAlpha: 0, y: 20 });
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: sec, start: 'top top', end: '+=150%', pin: true, scrub: 0.8, anticipatePin: 1 },
    onUpdate() {
      live.closeP = this.progress();
      const o = live.closeP > 0.4;
      if (o !== open) {
        open = o;
        decrypt(state, { text: o ? 'OPEN' : 'SEALED', duration: 0.35, chars: BLOCKS });
      }
    },
  });
  // The cream flood and an ink copy of the headline share one clip, so wherever the light
  // has reached, the headline is already ink — it is legible at every point of the scrub.
  tl.fromTo(pin, { '--cw': 62 }, { '--cw': mobile ? 84 : 112, duration: 0.6, ease: 'power2.inOut' }, 0.05)
    .fromTo(titles, { scale: 0.94 }, { scale: 1, duration: 0.6, ease: 'power2.inOut' }, 0.05)
    .to(cta, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'power2.out' }, 0.35)
    .fromTo(clips, { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.3, ease: 'power2.in' }, 0.42)
    .set({}, {}, 1);
}
