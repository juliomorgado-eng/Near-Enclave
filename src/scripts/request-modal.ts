// Shared invitation modal behavior. Markup contract (each version styles its own):
//   [data-open-request]            any trigger button/link
//   [data-request-modal]           dialog root; gets [data-open] when visible
//   [data-request-close]           close buttons / backdrop inside modal
//   form[data-request-form]        form; on valid submit gets [data-sent]
//   [data-request-success]         success message element (hidden until sent)
// Emits `request:open` / `request:close` on window so versions can pause Lenis etc.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function initRequestModal() {
  const modal = document.querySelector<HTMLElement>('[data-request-modal]');
  if (!modal) return;
  const form = modal.querySelector<HTMLFormElement>('form[data-request-form]');
  const success = modal.querySelector<HTMLElement>('[data-request-success]');
  let lastFocus: HTMLElement | null = null;

  const open = () => {
    lastFocus = document.activeElement as HTMLElement | null;
    modal.hidden = false;
    // next frame so CSS transitions run
    requestAnimationFrame(() => modal.setAttribute('data-open', ''));
    document.documentElement.style.overflow = 'hidden';
    window.dispatchEvent(new CustomEvent('request:open'));
    setTimeout(() => {
      // first visible field; after a submit the form is hidden, so fall back to any visible control
      const visible = [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      const first = visible.find((el) => el.tagName === 'INPUT') ?? visible[0];
      first?.focus({ preventScroll: true });
    }, 50);
  };

  const close = () => {
    modal.removeAttribute('data-open');
    document.documentElement.style.overflow = '';
    window.dispatchEvent(new CustomEvent('request:close'));
    const done = () => {
      modal.hidden = true;
      modal.removeEventListener('transitionend', done);
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) done();
    else {
      modal.addEventListener('transitionend', done);
      setTimeout(done, 600);
    }
    lastFocus?.focus({ preventScroll: true });
  };

  document.querySelectorAll('[data-open-request]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    }),
  );
  modal.querySelectorAll('[data-request-close]').forEach((el) => el.addEventListener('click', close));

  // Esc closes from anywhere while open (focus can land outside the dialog, e.g. after a submit)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden && modal.hasAttribute('data-open')) {
      e.preventDefault();
      close();
    }
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return;
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (!items.length) return;
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

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    // TODO: connect to backend / CRM. UI-only for now.
    form.setAttribute('data-sent', '');
    if (success) {
      success.hidden = false;
      if (!success.hasAttribute('tabindex')) success.setAttribute('tabindex', '-1');
      success.focus({ preventScroll: true });
    }
  });
}
