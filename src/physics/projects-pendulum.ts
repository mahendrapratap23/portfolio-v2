/**
 * projects-pendulum.ts — Pendulum physics and 3D card flip interactions for #sec-projects.
 *
 * Requirements:
 *  - Each project is a paper card hanging from a hand-drawn pushpin and string, tilted a few degrees.
 *  - Pendulum physics: rotation r, angular velocity vr, spring 0.05, damping 0.96.
 *  - Pen or finger brushing adds angular impulse from touch side and speed.
 *  - Tap flips the card (CSS 3D transform, 500 ms) to back showing repo name, description, language, and GitHub link.
 *  - Tap again or Escape flips back.
 *  - Sleep when settled and clear will-change.
 *  - Layout: 3 cols wide, 2 cols tablet, 1 col phone (cards max 85% width on phones).
 *  - Keyboard accessible: Enter/Space flips, Escape flips back.
 */

export const PENDULUM_SPRING = 0.05;
export const PENDULUM_DAMPING = 0.96;
export const SLEEP_THRESHOLD_R = 0.0008;
export const SLEEP_THRESHOLD_VR = 0.0003;

export interface PendulumCard {
  id: string;
  wrapperEl: HTMLElement;
  cardEl: HTMLElement;
  r: number;
  vr: number;
  restR: number;
  isSleeping: boolean;
  isFlipped: boolean;
  rect: DOMRect | null;
}

export class ProjectsPendulumManager {
  public cards: PendulumCard[] = [];
  public isVisible = false;
  public isTabVisible = typeof document !== 'undefined' ? !document.hidden : true;
  private observer: IntersectionObserver | null = null;
  private gridEl: HTMLElement | null = null;

  public init(gridId = 'project-grid'): void {
    if (typeof document === 'undefined') return;
    this.gridEl = document.getElementById(gridId);
    if (!this.gridEl) return;

    this.bindCards();
    this.bindEvents();

    if ('IntersectionObserver' in window) {
      const sec = this.gridEl.closest('section') || this.gridEl;
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          this.isVisible = entry.isIntersecting;
          if (this.isVisible) {
            this.measureBounds();
          }
        }
      }, { threshold: 0.05 });
      this.observer.observe(sec);
    } else {
      this.isVisible = true;
    }
  }

  public bindCards(): void {
    if (!this.gridEl) return;
    const wrappers = this.gridEl.querySelectorAll<HTMLElement>('.project-hanging-wrapper');
    const REST_TILTS = [-0.045, 0.038, -0.028, 0.042, -0.035, 0.032];

    this.cards = Array.from(wrappers).map((wrapper, index) => {
      const card = wrapper.querySelector<HTMLElement>('.project-card')!;
      const restR = REST_TILTS[index % REST_TILTS.length];
      const pCard: PendulumCard = {
        id: card.dataset.repo || `project-${index}`,
        wrapperEl: wrapper,
        cardEl: card,
        r: restR,
        vr: 0,
        restR,
        isSleeping: true,
        isFlipped: false,
        rect: null,
      };

      // Set initial transform
      wrapper.style.transform = `rotate(${restR.toFixed(4)}rad)`;
      return pCard;
    });

    this.measureBounds();
  }

  public measureBounds(): void {
    if (!this.isVisible) return;
    for (const card of this.cards) {
      card.rect = card.wrapperEl.getBoundingClientRect();
    }
  }

  private bindEvents(): void {
    if (!this.gridEl) return;

    // Flip on click/tap
    this.gridEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // If clicking the GitHub link directly, let it open normally
      if (target.closest('.project-link')) {
        return;
      }

      const cardEl = target.closest<HTMLElement>('.project-card');
      if (cardEl) {
        const found = this.cards.find((c) => c.cardEl === cardEl);
        if (found) {
          this.toggleFlip(found);
        }
      }
    });

    // Keyboard support: Enter / Space on card toggles flip, Escape closes
    this.gridEl.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      const cardEl = target.closest<HTMLElement>('.project-card');
      if (cardEl) {
        if (e.key === 'Enter' || e.key === ' ') {
          // Do not hijack if target is the link itself
          if (target.classList.contains('project-link')) return;
          e.preventDefault();
          const found = this.cards.find((c) => c.cardEl === cardEl);
          if (found) this.toggleFlip(found);
        }
      }
    });

    // Escape closes any flipped card
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        let flippedAny = false;
        for (const card of this.cards) {
          if (card.isFlipped) {
            this.setFlip(card, false);
            flippedAny = true;
          }
        }
        if (flippedAny) {
          // Return focus to first closed card if needed
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
      if (this.isTabVisible && this.isVisible) {
        this.measureBounds();
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      this.measureBounds();
    }, { passive: true });
  }

  public toggleFlip(card: PendulumCard): void {
    this.setFlip(card, !card.isFlipped);
  }

  public setFlip(card: PendulumCard, flipped: boolean): void {
    card.isFlipped = flipped;
    card.cardEl.classList.toggle('is-flipped', flipped);
    card.cardEl.setAttribute('aria-expanded', String(flipped));

    const front = card.cardEl.querySelector('.project-face-front');
    const back = card.cardEl.querySelector('.project-face-back');
    const link = card.cardEl.querySelector<HTMLAnchorElement>('.project-link');

    if (front) front.setAttribute('aria-hidden', String(flipped));
    if (back) back.setAttribute('aria-hidden', String(!flipped));
    if (link) {
      link.tabIndex = flipped ? 0 : -1;
    }

    // Give a small wobble impulse on flip
    this.applyImpulse(card, flipped ? 0.025 : -0.025);
  }

  public applyImpulse(card: PendulumCard, impulse: number): void {
    card.vr += impulse;
    card.isSleeping = false;
    card.wrapperEl.style.willChange = 'transform';
  }

  /**
   * Brush check against pointer coordinates.
   */
  public handlePointerBrush(penX: number, penY: number, penSpeed: number): void {
    if (!this.isVisible || penSpeed < 1.2) return;

    for (const card of this.cards) {
      if (!card.rect) card.rect = card.wrapperEl.getBoundingClientRect();
      const r = card.rect;

      // Check if pen is inside card bounds
      if (
        penX >= r.left &&
        penX <= r.right &&
        penY >= r.top &&
        penY <= r.bottom
      ) {
        const cardCenterX = r.left + r.width / 2;
        const dx = penX - cardCenterX;
        const touchSide = Math.sign(dx) || 1;
        // Angular impulse scaled by side and speed
        const impulse = -touchSide * Math.min(penSpeed * 0.002, 0.05);
        this.applyImpulse(card, impulse);
      }
    }
  }

  /**
   * Single fixed-timestep step for pendulum physics.
   */
  public stepPhysics(penX = -9999, penY = -9999, penSpeed = 0): void {
    if (!this.isVisible || !this.isTabVisible) return;

    if (penSpeed > 1.2) {
      this.handlePointerBrush(penX, penY, penSpeed);
    }

    for (const card of this.cards) {
      if (card.isSleeping) continue;

      // Pendulum spring force pulling toward rest tilt
      const springForce = -(card.r - card.restR) * PENDULUM_SPRING;
      card.vr = (card.vr + springForce) * PENDULUM_DAMPING;
      card.r += card.vr;

      // Settle check
      if (
        Math.abs(card.r - card.restR) < SLEEP_THRESHOLD_R &&
        Math.abs(card.vr) < SLEEP_THRESHOLD_VR
      ) {
        card.r = card.restR;
        card.vr = 0;
        card.isSleeping = true;
        card.wrapperEl.style.willChange = 'auto';
        card.wrapperEl.style.transform = `rotate(${card.restR.toFixed(4)}rad)`;
      } else {
        card.wrapperEl.style.transform = `rotate(${card.r.toFixed(4)}rad)`;
      }
    }
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export const projectsPendulumManager = new ProjectsPendulumManager();
