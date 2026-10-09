/**
 * contact-plane.ts — Explicit state machine for paper plane fold and flight animation (#sec-hello).
 *
 * State Machine:
 *   idle -> folding -> flying -> sent -> returning -> idle
 *
 * Rules:
 *  - Every transition has a guaranteed exit: transitionend / animationend AND fallback timer.
 *  - Folding: 700 ms (transitionend or fallback). Button disabled.
 *  - Flying: 800 ms (animationend or fallback). Plane flies off, mailto opens once.
 *  - Sent: 600 ms wait. Shows handwritten line "sent. write again?".
 *  - Returning: 500 ms (animationend or fallback). Note unfolds and flies/fades back into view.
 *  - Idle: DOM and styles fully restored, button re-enabled and focused.
 *  - Opens existing mailto: address from the site (mp498343@gmail.com). Never hardcoded/invented.
 *  - Safety timeout: 1500 ms hard timeout guarantees mailto is never blocked.
 *  - Try/finally ensures mailto still opens and returns to idle even if an error occurs.
 *  - Reduced motion: skip folding & flying, open mailto, show "sent. write again?", restore at once.
 */

export const FOLD_DURATION_MS = 700;
export const FLY_DURATION_MS = 800;
export const SENT_WAIT_MS = 600;
export const RETURN_DURATION_MS = 500;
export const MAX_MAILTO_TIMEOUT_MS = 1500;

export type PlaneState = 'idle' | 'folding' | 'flying' | 'sent' | 'returning';

export class ContactPlaneManager {
  public state: PlaneState = 'idle';
  public noteEl: HTMLElement | null = null;
  public planeEl: HTMLElement | null = null;
  public sendBtn: HTMLButtonElement | null = null;
  public resetBtn: HTMLButtonElement | null = null;
  public trailEl: HTMLElement | null = null;
  public statusEl: HTMLElement | null = null;
  public mailtoHref = 'mailto:mp498343@gmail.com';
  public mailtoOpened = false;
  private safetyTimer: number | null = null;
  private transitionTimer: number | null = null;
  private isRM = false;

  public init(noteId = 'contact-note'): void {
    if (typeof document === 'undefined') return;

    this.isRM = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.noteEl = document.getElementById(noteId);
    if (!this.noteEl) return;

    this.planeEl = document.getElementById('paper-plane-svg');
    this.trailEl = document.getElementById('paper-plane-trail');
    this.statusEl = document.getElementById('plane-status');
    this.sendBtn = document.getElementById('btn-send-plane') as HTMLButtonElement | null;
    this.resetBtn = document.getElementById('btn-reset-plane') as HTMLButtonElement | null;

    // Read existing mailto from page to ensure zero discrepancy
    const existingMailto = this.noteEl.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    if (existingMailto && existingMailto.href) {
      this.mailtoHref = existingMailto.href;
    }

    this.bindEvents();
  }

  private bindEvents(): void {
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => {
        this.send();
      });
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        this.reset();
      });
    }
  }

  public send(): void {
    if (this.state !== 'idle') return;

    this.mailtoOpened = false;
    if (this.sendBtn) {
      this.sendBtn.disabled = true;
    }

    // Reduced motion or missing elements: skip folding & flying, open mailto immediately, restore to idle
    if (this.isRM || !this.noteEl || !this.planeEl) {
      try {
        this.openMailto();
        this.showStatus('sent. write again?');
      } finally {
        this.reset();
      }
      return;
    }

    try {
      this.state = 'folding';
      this.noteEl.classList.remove('is-returning', 'is-hidden');
      this.noteEl.classList.add('is-folding');

      // Safety timeout: mailto never blocked longer than 1500 ms
      this.safetyTimer = (setTimeout(() => {
        this.openMailto();
      }, MAX_MAILTO_TIMEOUT_MS) as unknown as number);

      // Transition to flying on transitionend or fallback (750 ms)
      this.awaitTransition(this.noteEl, FOLD_DURATION_MS + 50, () => {
        this.onFoldingComplete();
      });
    } catch {
      this.openMailto();
      this.reset();
    }
  }

  public onFoldingComplete(): void {
    if (this.state !== 'folding') return;
    this.state = 'flying';

    this.noteEl?.classList.remove('is-folding');
    this.noteEl?.classList.add('is-hidden');
    this.planeEl?.classList.add('is-flying');
    this.trailEl?.classList.add('is-flying');

    // Mailto opens during flight exactly once
    this.openMailto();

    // Transition to sent on animationend or fallback (850 ms)
    this.awaitAnimation(this.planeEl, FLY_DURATION_MS + 50, () => {
      this.onFlyingComplete();
    });
  }

  public onFlyingComplete(): void {
    if (this.state !== 'flying') return;
    this.state = 'sent';

    this.planeEl?.classList.remove('is-flying');
    this.trailEl?.classList.remove('is-flying');

    // Show handwritten status line "sent. write again?"
    this.showStatus('sent. write again?');

    // Wait 600 ms, then transition to returning
    this.transitionTimer = (setTimeout(() => {
      this.startReturning();
    }, SENT_WAIT_MS) as unknown as number);
  }

  public startReturning(): void {
    if (this.state !== 'sent') return;
    this.state = 'returning';

    if (this.noteEl) {
      this.noteEl.classList.remove('is-hidden');
      this.noteEl.classList.add('is-returning');
    }

    // Transition to idle on animationend / transitionend or fallback (550 ms)
    this.awaitAnimation(this.noteEl, RETURN_DURATION_MS + 50, () => {
      this.reset();
    });
  }

  public openMailto(): void {
    if (this.mailtoOpened) return;
    this.mailtoOpened = true;
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }

    try {
      const a = document.createElement('a');
      a.href = this.mailtoHref;
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      if (typeof window !== 'undefined') {
        window.location.href = this.mailtoHref;
      }
    }
  }

  public showStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  public clearStatus(): void {
    if (this.statusEl) {
      this.statusEl.textContent = '';
    }
  }

  public reset(): void {
    this.state = 'idle';
    this.mailtoOpened = false;

    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    // Completely restore DOM and styles on original note
    if (this.noteEl) {
      this.noteEl.classList.remove('is-folding', 'is-hidden', 'is-returning');
      this.noteEl.style.transform = '';
      this.noteEl.style.opacity = '';
      this.noteEl.style.animation = '';
    }

    // Restore plane and trail elements
    if (this.planeEl) {
      this.planeEl.classList.remove('is-flying', 'is-gone');
      this.planeEl.style.transform = '';
      this.planeEl.style.opacity = '';
      this.planeEl.style.animation = '';
    }
    if (this.trailEl) {
      this.trailEl.classList.remove('is-flying');
    }

    // Re-enable send button
    if (this.sendBtn) {
      this.sendBtn.disabled = false;
      this.sendBtn.style.display = 'inline-flex';
    }

    this.clearStatus();
  }

  private awaitTransition(el: HTMLElement | null, fallbackMs: number, callback: () => void): void {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (el && typeof el.removeEventListener === 'function') {
        el.removeEventListener('transitionend', onEnd);
      }
      callback();
    };
    const onEnd = (e: Event) => {
      if (!el || e.target === el) {
        finish();
      }
    };
    if (el && typeof el.addEventListener === 'function') {
      el.addEventListener('transitionend', onEnd, { once: true });
    }
    timer = setTimeout(finish, fallbackMs);
  }

  private awaitAnimation(el: HTMLElement | null, fallbackMs: number, callback: () => void): void {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (el && typeof el.removeEventListener === 'function') {
        el.removeEventListener('animationend', onEnd);
      }
      callback();
    };
    const onEnd = (e: Event) => {
      if (!el || e.target === el) {
        finish();
      }
    };
    if (el && typeof el.addEventListener === 'function') {
      el.addEventListener('animationend', onEnd, { once: true });
    }
    timer = setTimeout(finish, fallbackMs);
  }
}

export const contactPlaneManager = new ContactPlaneManager();
