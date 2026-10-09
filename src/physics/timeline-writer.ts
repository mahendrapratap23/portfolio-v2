/**
 * timeline-writer.ts — Hand-drawn self-drawing timeline and handwriting fade for #sec-work.
 *
 * Requirements:
 *  - Include experience, education, certifications in exact same order and wording.
 *  - Thin hand-drawn SVG path runs down left side.
 *  - Draws itself tied to scroll progress (stroke-dashoffset), RAF active only while section is visible.
 *  - Each entry is "written in" when reaching the middle of the viewport with short staggered handwriting fade (<= 800 ms total).
 *  - Press and hold (400 ms) or tap an entry spawns up to 3 ink blots around it (6s fade), without delaying scroll or blocking links.
 *  - Real text in DOM from the start; with reduced motion everything is immediately visible and line fully drawn.
 */

import { spawnBlot } from './ink.js';

export const MAX_STAGGER_DELAY_MS = 800;
export const PRESS_HOLD_MS = 400;
export const MAX_BLOTS_PER_TAP = 3;

export function calculateScrollProgress(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number
): number {
  // Start drawing when top of section enters 85% of viewport
  const start = viewportHeight * 0.85;
  // Fully drawn when bottom of section reaches middle of viewport
  const totalDistance = sectionHeight + start - viewportHeight * 0.4;
  if (totalDistance <= 0) return 1;

  const traveled = start - sectionTop;
  return Math.max(0, Math.min(1, traveled / totalDistance));
}

export function generateWobblyLine(height: number): string {
  const points: Array<{ x: number; y: number }> = [];
  const step = 35;
  const count = Math.max(4, Math.ceil(height / step));

  points.push({ x: 12, y: 0 });

  for (let i = 1; i <= count; i++) {
    const y = Math.min(height, i * step);
    // Subtle sinusoidal wobble: +/- 2.5px
    const wobble = Math.sin(i * 1.3) * 2.2 + Math.cos(i * 0.7) * 0.8;
    const x = 12 + wobble;
    points.push({ x, y });
  }

  // Build SVG path data with smooth quadratic curves
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = ((prev.x + curr.x) / 2).toFixed(1);
    const midY = ((prev.y + curr.y) / 2).toFixed(1);
    d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)}, ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  return d;
}

export class TimelineWriter {
  public sectionEl: HTMLElement | null = null;
  public pathEl: SVGPathElement | null = null;
  public items: HTMLElement[] = [];
  public isVisible = false;
  public totalPathLength = 0;
  private observer: IntersectionObserver | null = null;
  private animId: number | null = null;
  private isRM = false;

  public init(sectionId = 'sec-work'): void {
    if (typeof document === 'undefined') return;

    this.isRM = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sectionEl = document.getElementById(sectionId);
    if (!this.sectionEl) return;

    this.pathEl = this.sectionEl.querySelector<SVGPathElement>('#timeline-path');
    this.items = Array.from(this.sectionEl.querySelectorAll<HTMLElement>('.timeline-item'));

    this.setupStaggerWordDelays();
    this.setupPath();
    this.bindInteractions();

    if (this.isRM) {
      this.revealAllImmediately();
      return;
    }

    // IntersectionObserver to only animate when section is in viewport
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          this.isVisible = entry.isIntersecting;
          if (this.isVisible) {
            this.startScrollLoop();
          } else {
            this.stopScrollLoop();
          }
        }
      }, { threshold: 0.01 });
      this.observer.observe(this.sectionEl);
    } else {
      this.isVisible = true;
      this.startScrollLoop();
    }
  }

  public setupStaggerWordDelays(): void {
    // For each timeline item, set CSS custom properties for staggered handwriting fade
    this.items.forEach((item) => {
      // Find text spans inside item (title, org, detail, or cert lis)
      const spans = item.querySelectorAll<HTMLElement>('.work-title, .work-org, .work-detail, li');
      let totalIndex = 0;
      spans.forEach((el) => {
        const delayMs = Math.min(MAX_STAGGER_DELAY_MS, totalIndex * 60);
        el.style.setProperty('--entry-delay', `${delayMs}ms`);
        totalIndex++;
      });
    });
  }

  public setupPath(): void {
    if (!this.sectionEl || !this.pathEl) return;

    const wrapper = this.sectionEl.querySelector<HTMLElement>('.timeline-wrapper');
    const height = wrapper ? wrapper.offsetHeight : this.sectionEl.offsetHeight;

    const d = generateWobblyLine(Math.max(100, height));
    this.pathEl.setAttribute('d', d);

    try {
      this.totalPathLength = this.pathEl.getTotalLength() || height;
    } catch {
      this.totalPathLength = height;
    }

    if (this.isRM) {
      this.pathEl.style.strokeDasharray = 'none';
      this.pathEl.style.strokeDashoffset = '0';
    } else {
      this.pathEl.style.strokeDasharray = `${this.totalPathLength} ${this.totalPathLength}`;
      this.pathEl.style.strokeDashoffset = `${this.totalPathLength}`;
    }
  }

  public revealAllImmediately(): void {
    if (this.pathEl) {
      this.pathEl.style.strokeDasharray = 'none';
      this.pathEl.style.strokeDashoffset = '0';
    }
    this.items.forEach((item) => {
      item.classList.add('is-written');
    });
  }

  public updateScrollProgress(): void {
    if (!this.sectionEl || !this.pathEl || this.isRM) return;

    const rect = this.sectionEl.getBoundingClientRect();
    const vh = window.innerHeight;

    // 1. Draw SVG path according to scroll progress
    const progress = calculateScrollProgress(rect.top, rect.height, vh);
    const offset = this.totalPathLength * (1 - progress);
    this.pathEl.style.strokeDashoffset = `${offset.toFixed(1)}px`;

    // 2. Check each entry reaching middle of viewport
    const midPoint = vh * 0.58;
    for (const item of this.items) {
      if (!item.classList.contains('is-written')) {
        const itemRect = item.getBoundingClientRect();
        if (itemRect.top <= midPoint) {
          item.classList.add('is-written');
        }
      }
    }
  }

  private startScrollLoop(): void {
    if (this.animId !== null || this.isRM) return;
    const tick = () => {
      if (this.isVisible) {
        this.updateScrollProgress();
        this.animId = requestAnimationFrame(tick);
      } else {
        this.animId = null;
      }
    };
    this.animId = requestAnimationFrame(tick);
  }

  private stopScrollLoop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  private bindInteractions(): void {
    if (!this.sectionEl) return;

    // Press and hold (400ms) or tap an entry spawns ink drops
    this.items.forEach((item) => {
      let holdTimer: number | null = null;
      let startX = 0;
      let startY = 0;
      let startTime = 0;
      let holdFired = false;

      const triggerBlots = (clientX: number, clientY: number) => {
        const now = performance.now();
        const W = window.innerWidth;
        const H = window.innerHeight;
        // Spawn 2-3 blots around point
        for (let i = 0; i < MAX_BLOTS_PER_TAP; i++) {
          const offsetX = (Math.random() - 0.5) * 40;
          const offsetY = (Math.random() - 0.5) * 24;
          spawnBlot(clientX + offsetX, clientY + offsetY, now + i * 40, W, H);
        }
      };

      item.addEventListener('pointerdown', (e) => {
        // Do not delay scroll or block links
        if ((e.target as HTMLElement).closest('a')) return;

        startX = e.clientX;
        startY = e.clientY;
        startTime = performance.now();
        holdFired = false;

        holdTimer = window.setTimeout(() => {
          holdFired = true;
          triggerBlots(e.clientX, e.clientY);
        }, PRESS_HOLD_MS);
      }, { passive: true });

      item.addEventListener('pointermove', (e) => {
        // If movement exceeds 8px, user is scrolling: cancel hold
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        }
      }, { passive: true });

      item.addEventListener('pointerup', (e) => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }

        const elapsed = performance.now() - startTime;
        // If tap under 300ms without scrolling, trigger blots
        if (!holdFired && elapsed < 300 && Math.hypot(e.clientX - startX, e.clientY - startY) < 8) {
          triggerBlots(e.clientX, e.clientY);
        }
      }, { passive: true });

      item.addEventListener('pointercancel', () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      }, { passive: true });
    });

    window.addEventListener('resize', () => {
      this.setupPath();
      this.updateScrollProgress();
    }, { passive: true });
  }

  public destroy(): void {
    this.stopScrollLoop();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export const timelineWriter = new TimelineWriter();
