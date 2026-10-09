/**
 * contact-plane.ts — Paper plane fold and flight animation for #sec-hello.
 *
 * Requirements:
 *  - Replace plain email link in "say hello" with a handwritten note.
 *  - Visible button "send" folds the note into a paper plane (700 ms).
 *  - Plane flies off screen along a curved path (800 ms) with a faint ink trail.
 *  - Opens existing mailto: link from the site (mp498343@gmail.com). Never hardcode/invent a new one.
 *  - Reliability: opens mailto even if animation fails/interrupted or with reduced motion.
 *  - Never block click for longer than 1.5 seconds (1500 ms safety timeout).
 *  - Visible "write again" button resets note after plane is gone.
 *  - Keep github, linkedin, resume links visible, keyboard reachable, and 44 px tall.
 */

export const FOLD_DURATION_MS = 700;
export const FLY_DURATION_MS = 800;
export const MAX_MAILTO_TIMEOUT_MS = 1500;

export type PlaneState = 'idle' | 'folding' | 'flying' | 'sent';

export class ContactPlaneManager {
  public state: PlaneState = 'idle';
  public noteEl: HTMLElement | null = null;
  public planeEl: HTMLElement | null = null;
  public sendBtn: HTMLButtonElement | null = null;
  public resetBtn: HTMLButtonElement | null = null;
  public trailEl: HTMLElement | null = null;
  public mailtoHref = 'mailto:mp498343@gmail.com';
  private mailtoOpened = false;
  private safetyTimer: number | null = null;
  private isRM = false;

  public init(noteId = 'contact-note'): void {
    if (typeof document === 'undefined') return;

    this.isRM = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.noteEl = document.getElementById(noteId);
    if (!this.noteEl) return;

    this.planeEl = document.getElementById('paper-plane-svg');
    this.trailEl = document.getElementById('paper-plane-trail');
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

    // Reduced motion or missing animation elements: open mailto immediately
    if (this.isRM || !this.noteEl || !this.planeEl) {
      this.openMailto();
      this.state = 'sent';
      this.showResetButton();
      return;
    }

    this.state = 'folding';
    this.noteEl.classList.add('is-folding');

    // 1500ms hard safety timeout: NEVER block click longer than 1.5s
    this.safetyTimer = (setTimeout(() => {
      if (!this.mailtoOpened) {
        this.openMailto();
      }
    }, MAX_MAILTO_TIMEOUT_MS) as unknown as number);

    // Stage 1: Folding (700 ms)
    setTimeout(() => {
      if (this.state !== 'folding') return;
      this.state = 'flying';
      this.noteEl?.classList.remove('is-folding');
      this.noteEl?.classList.add('is-hidden');
      this.planeEl?.classList.add('is-flying');
      this.trailEl?.classList.add('is-flying');

      // Stage 2: Flying (800 ms) -> opens mailto
      setTimeout(() => {
        this.openMailto();
        this.state = 'sent';
        this.planeEl?.classList.remove('is-flying');
        this.planeEl?.classList.add('is-gone');
        this.trailEl?.classList.remove('is-flying');
        this.showResetButton();
      }, FLY_DURATION_MS);
    }, FOLD_DURATION_MS);
  }

  public openMailto(): void {
    if (this.mailtoOpened) return;
    this.mailtoOpened = true;
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }

    try {
      // Create temporary link or navigate
      const a = document.createElement('a');
      a.href = this.mailtoHref;
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.location.href = this.mailtoHref;
    }
  }

  public showResetButton(): void {
    if (this.resetBtn) {
      this.resetBtn.style.display = 'inline-flex';
      this.resetBtn.focus();
    }
    if (this.sendBtn) {
      this.sendBtn.style.display = 'none';
    }
  }

  public reset(): void {
    this.state = 'idle';
    this.mailtoOpened = false;
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }

    if (this.noteEl) {
      this.noteEl.classList.remove('is-folding', 'is-hidden');
    }
    if (this.planeEl) {
      this.planeEl.classList.remove('is-flying', 'is-gone');
    }
    if (this.trailEl) {
      this.trailEl.classList.remove('is-flying');
    }
    if (this.resetBtn) {
      this.resetBtn.style.display = 'none';
    }
    if (this.sendBtn) {
      this.sendBtn.style.display = 'inline-flex';
      this.sendBtn.focus();
    }
  }
}

export const contactPlaneManager = new ContactPlaneManager();
