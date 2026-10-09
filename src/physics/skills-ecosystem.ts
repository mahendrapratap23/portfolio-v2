/**
 * skills-ecosystem.ts — Living skills creature ecosystem for #sec-skills.
 *
 * Requirements:
 *  - Each skill becomes an ink creature inside #sec-skills.
 *  - Creature drawing style: wobbly outline (sinusoidal polar radius), two eyes facing heading,
 *    skill name written next to it in custom handwriting font.
 *  - Wandering with soft boundaries, avoiding overlapping text, curious to resting pen, fleeing fast pen.
 *  - Dragging: spring (stiffness 0.12, damping 0.8) with stretched tail, retains momentum on release.
 *  - Scroll safety: touch-action: pan-y on canvas, touch-action: none on 44px+ creature hit area only.
 *  - Linking: creatures dropped within 120px form a spring-connected ink line; fades after 8s or
 *    when pulled beyond 220px. Cap at 6 simultaneous links.
 *  - Performance: IntersectionObserver pauses when off screen; tab visibility pauses when hidden;
 *    dpr capped at 2.
 *  - Fallback: with prefers-reduced-motion or on canvas failure, shows plain handwritten list.
 */

export interface SkillCreature {
  id: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading angle in radians */
  a: number;
  /** Phase offset for wobble */
  ph: number;
  /** Base radius */
  r: number;
  /** Drag state */
  isDragged: boolean;
  dragTargetX: number;
  dragTargetY: number;
  /** Tail lag position for stretched tail during drag */
  tailX: number;
  tailY: number;
}

export interface SkillLink {
  id: string;
  a: SkillCreature;
  b: SkillCreature;
  createdAt: number;
  alpha: number;
}

export interface TextObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SKILL_NAMES = [
  'Python',
  'TypeScript',
  'React',
  'Next.js',
  'AI agents',
  'LLM orchestration',
  'local-first systems',
  'full-stack engineering',
  'open source',
] as const;

export const DRAG_STIFFNESS = 0.12;
export const DRAG_DAMPING = 0.8;
export const LINK_DROP_RADIUS = 120;
export const LINK_BREAK_RADIUS = 220;
export const LINK_LIFETIME_MS = 8000;
export const MAX_SIMULTANEOUS_LINKS = 6;
export const HIT_RADIUS = 24; // 48px hit diameter >= 44px touch target

export class SkillsEcosystem {
  public creatures: SkillCreature[] = [];
  public links: SkillLink[] = [];
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;
  public container: HTMLElement | null = null;
  public width = 0;
  public height = 0;
  public isVisible = false;
  public isTabVisible = typeof document !== 'undefined' ? !document.hidden : true;
  public inkColor = '#1b2340';
  public paperColor = '#ffffff';

  private activeDragPointerId: number | null = null;
  private draggedCreature: SkillCreature | null = null;
  private animId: number | null = null;
  private textObstacles: TextObstacle[] = [];
  private observer: IntersectionObserver | null = null;
  private linkCounter = 0;

  constructor() {
    this.initCreaturesData();
  }

  public initCreaturesData(): void {
    this.creatures = SKILL_NAMES.map((name, index) => {
      // Scatter initial positions staggered nicely
      const angle = (index / SKILL_NAMES.length) * Math.PI * 2;
      return {
        id: index,
        name,
        x: 100 + Math.cos(angle) * 80,
        y: 100 + Math.sin(angle) * 80,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        a: angle,
        ph: Math.random() * Math.PI * 2,
        r: 15,
        isDragged: false,
        dragTargetX: 0,
        dragTargetY: 0,
        tailX: 100,
        tailY: 100,
      };
    });
  }

  public init(containerId: string, canvasId: string): boolean {
    const RM = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (RM) return false;

    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!this.container || !this.canvas) return false;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return false;
    this.ctx = ctx;

    this.readStyles();
    this.resize();
    this.distributeCreatures();
    this.measureObstacles();
    this.bindEvents();

    // Mark active for CSS fallback hiding
    this.container.classList.add('skills-active');

    // IntersectionObserver to pause off screen
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          this.isVisible = entry.isIntersecting;
          if (this.isVisible) {
            this.startLoop();
          } else {
            this.stopLoop();
          }
        }
      }, { threshold: 0.05 });
      this.observer.observe(this.container);
    } else {
      this.isVisible = true;
      this.startLoop();
    }

    return true;
  }

  public readStyles(): void {
    if (typeof document === 'undefined') return;
    const s = getComputedStyle(document.documentElement);
    this.inkColor = s.getPropertyValue('--ink').trim() || '#1b2340';
    this.paperColor = s.getPropertyValue('--paper').trim() || '#ffffff';
  }

  public resize(): void {
    if (!this.container || !this.canvas || !this.ctx) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(rect.width, 300);
    this.height = Math.max(rect.height || 240, 200);

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.measureObstacles();
  }

  public distributeCreatures(): void {
    if (this.width <= 0 || this.height <= 0) return;
    const cols = this.width > 600 ? 3 : 2;
    const rows = Math.ceil(this.creatures.length / cols);
    const cellW = (this.width - 60) / cols;
    const cellH = (this.height - 60) / rows;

    this.creatures.forEach((c, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      c.x = 40 + col * cellW + Math.random() * (cellW * 0.4);
      c.y = 40 + row * cellH + Math.random() * (cellH * 0.4);
      c.tailX = c.x;
      c.tailY = c.y;
    });
  }

  public measureObstacles(): void {
    if (!this.container) return;
    this.textObstacles = [];
    const sec = this.container.closest('section');
    if (!sec) return;

    // Obstacles to avoid: h2 and any subtitle or note in section
    const h2 = sec.querySelector('h2');
    const note = sec.querySelector('.row');
    const containerRect = this.container.getBoundingClientRect();

    if (h2) {
      const r = h2.getBoundingClientRect();
      const localTop = r.top - containerRect.top;
      // Include if overlapping or close to container space
      if (localTop + r.height > -30 && localTop < this.height + 30) {
        this.textObstacles.push({
          x: r.left - containerRect.left - 10,
          y: localTop - 10,
          width: r.width + 20,
          height: r.height + 20,
        });
      }
    }

    if (note) {
      const r = note.getBoundingClientRect();
      const localTop = r.top - containerRect.top;
      if (localTop + r.height > -30 && localTop < this.height + 30) {
        this.textObstacles.push({
          x: r.left - containerRect.left - 10,
          y: localTop - 10,
          width: r.width + 20,
          height: r.height + 20,
        });
      }
    }
  }

  private bindEvents(): void {
    if (!this.canvas) return;

    // Passive touch-action: pan-y default. Only capture pointer when a creature is touched!
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // Find closest creature within hit radius
      let hit: SkillCreature | null = null;
      let closestDist = Infinity;
      for (const c of this.creatures) {
        const d = Math.hypot(c.x - px, c.y - py);
        if (d <= HIT_RADIUS && d < closestDist) {
          closestDist = d;
          hit = c;
        }
      }

      if (hit) {
        // Creature hit: take capture and start dragging
        this.canvas!.setPointerCapture(e.pointerId);
        this.activeDragPointerId = e.pointerId;
        this.draggedCreature = hit;
        hit.isDragged = true;
        hit.dragTargetX = px;
        hit.dragTargetY = py;
      }
    }, { passive: true });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.draggedCreature && e.pointerId === this.activeDragPointerId) {
        const rect = this.canvas!.getBoundingClientRect();
        this.draggedCreature.dragTargetX = e.clientX - rect.left;
        this.draggedCreature.dragTargetY = e.clientY - rect.top;
      }
    }, { passive: true });

    const endDrag = (e: PointerEvent, checkDrop: boolean) => {
      if (this.draggedCreature && e.pointerId === this.activeDragPointerId) {
        const c = this.draggedCreature;
        c.isDragged = false;
        if (checkDrop) {
          this.checkDropLinking(c);
        }
        this.draggedCreature = null;
        this.activeDragPointerId = null;
        try {
          if (this.canvas && this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
          }
        } catch {
          // ignore if already released
        }
      }
    };

    this.canvas.addEventListener('pointerup', (e) => endDrag(e, true), { passive: true });
    this.canvas.addEventListener('pointercancel', (e) => endDrag(e, false), { passive: true });

    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
      if (this.isTabVisible && this.isVisible) {
        this.startLoop();
      } else {
        this.stopLoop();
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      this.resize();
    }, { passive: true });
  }

  public checkDropLinking(dropped: SkillCreature): void {
    const now = performance.now();
    for (const other of this.creatures) {
      if (other === dropped) continue;
      const d = Math.hypot(other.x - dropped.x, other.y - dropped.y);
      if (d <= LINK_DROP_RADIUS) {
        // Check if already linked
        const exists = this.links.some(
          (l) => (l.a === dropped && l.b === other) || (l.a === other && l.b === dropped)
        );
        if (!exists) {
          if (this.links.length >= MAX_SIMULTANEOUS_LINKS) {
            // Remove oldest link
            this.links.shift();
          }
          this.links.push({
            id: `link-${++this.linkCounter}`,
            a: dropped,
            b: other,
            createdAt: now,
            alpha: 1.0,
          });
        }
      }
    }
  }

  /**
   * Physics step (called at 60 Hz).
   */
  public stepPhysics(
    penX = -9999,
    penY = -9999,
    penSpeed = 0,
    penSeen = false,
    now = performance.now()
  ): void {
    const W = this.width || 400;
    const H = this.height || 300;

    // Convert global pen to local coordinates if pen is active
    let localPenX = -9999;
    let localPenY = -9999;
    let localPenSeen = false;

    if (penSeen && this.container) {
      const rect = this.container.getBoundingClientRect();
      localPenX = penX - rect.left;
      localPenY = penY - rect.top;
      // Is pen roughly within section margin?
      if (
        localPenX >= -100 &&
        localPenX <= W + 100 &&
        localPenY >= -100 &&
        localPenY <= H + 100
      ) {
        localPenSeen = true;
      }
    }

    // 1. Step Creatures
    for (const c of this.creatures) {
      c.ph += 0.06;

      if (c.isDragged) {
        // Drag spring physics: stiffness 0.12, damping 0.8
        const fx = (c.dragTargetX - c.x) * DRAG_STIFFNESS;
        const fy = (c.dragTargetY - c.y) * DRAG_STIFFNESS;
        c.vx = (c.vx + fx) * DRAG_DAMPING;
        c.vy = (c.vy + fy) * DRAG_DAMPING;
        c.x += c.vx;
        c.y += c.vy;

        // Tail stretches opposite velocity
        c.tailX += (c.x - c.vx * 3 - c.tailX) * 0.25;
        c.tailY += (c.y - c.vy * 3 - c.tailY) * 0.25;

        // Heading follows drag direction
        const sp = Math.hypot(c.vx, c.vy);
        if (sp > 0.2) {
          c.a = Math.atan2(c.vy, c.vx);
        }
      } else {
        // Normal wandering + curious/flee behavior
        c.a += (Math.random() - 0.5) * 0.15;
        let sx = Math.cos(c.a) * 0.7;
        let sy = Math.sin(c.a) * 0.7;

        if (localPenSeen) {
          const dx = localPenX - c.x;
          const dy = localPenY - c.y;
          const d = Math.hypot(dx, dy) || 1;

          if (penSpeed > 9 && d < 220) {
            // Flee fast pen
            sx -= (dx / d) * 3.5;
            sy -= (dy / d) * 3.5;
          } else if (penSpeed < 1.5 && d < 340 && d > 60) {
            // Curious toward resting pen
            sx += (dx / d) * 1.3;
            sy += (dy / d) * 1.3;
          }
        }

        // Avoid text obstacles
        for (const obs of this.textObstacles) {
          const cx = obs.x + obs.width / 2;
          const cy = obs.y + obs.height / 2;
          const dx = c.x - cx;
          const dy = c.y - cy;
          const halfW = obs.width / 2 + c.r + 15;
          const halfH = obs.height / 2 + c.r + 15;

          if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
            const pushX = (halfW - Math.abs(dx)) * Math.sign(dx || 1) * 0.1;
            const pushY = (halfH - Math.abs(dy)) * Math.sign(dy || 1) * 0.1;
            sx += pushX;
            sy += pushY;
          }
        }

        // Soft boundaries at canvas edges
        const margin = 35;
        if (c.x < margin) sx += (margin - c.x) * 0.05;
        if (c.x > W - margin) sx -= (c.x - (W - margin)) * 0.05;
        if (c.y < margin) sy += (margin - c.y) * 0.05;
        if (c.y > H - margin) sy -= (c.y - (H - margin)) * 0.05;

        // Creature-to-creature soft repulsion
        for (const other of this.creatures) {
          if (other === c) continue;
          const dx = c.x - other.x;
          const dy = c.y - other.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = c.r + other.r + 25;
          if (dist < minDist) {
            const rep = (minDist - dist) * 0.04;
            sx += (dx / dist) * rep;
            sy += (dy / dist) * rep;
          }
        }

        // Steer around other creatures' skill text to keep words completely readable
        for (const other of this.creatures) {
          if (other === c) continue;
          const textW = Math.max(65, other.name.length * 10);
          const textOnRight = other.x + other.r + 7 + textW <= W - 10;
          const tLeft = textOnRight ? other.x + other.r + 2 : other.x - other.r - 8 - textW;
          const tRight = textOnRight ? other.x + other.r + 8 + textW : other.x - other.r - 2;
          const tTop = other.y - 14;
          const tBottom = other.y + 14;

          const closeX = Math.max(tLeft, Math.min(tRight, c.x));
          const closeY = Math.max(tTop, Math.min(tBottom, c.y));
          const cdx = c.x - closeX;
          const cdy = c.y - closeY;
          const cdist = Math.hypot(cdx, cdy) || 1;
          const clearance = c.r + 10;

          if (cdist < clearance) {
            const steer = (clearance - cdist) * 0.06;
            sx += (cdx / cdist) * steer;
            sy += (cdy / cdist) * steer;
          }
        }

        // Momentum retention on release, converging smoothly to wander speed
        c.vx += (sx - c.vx) * 0.08;
        c.vy += (sy - c.vy) * 0.08;
        c.x += c.vx;
        c.y += c.vy;

        // Tail catches up to center
        c.tailX += (c.x - c.tailX) * 0.2;
        c.tailY += (c.y - c.tailY) * 0.2;

        // Keep strictly inside bounds
        c.x = Math.max(15, Math.min(W - 15, c.x));
        c.y = Math.max(15, Math.min(H - 15, c.y));
      }
    }

    // 2. Step Links: spring pull, aging, distance break
    for (let i = this.links.length - 1; i >= 0; i--) {
      const link = this.links[i];
      const dist = Math.hypot(link.b.x - link.a.x, link.b.y - link.a.y) || 1;
      const age = now - link.createdAt;

      // Break if dragged apart > 220px
      if (dist > LINK_BREAK_RADIUS) {
        this.links.splice(i, 1);
        continue;
      }

      // Fade after 8s (lifetime 8000ms, fade over 1000ms after)
      if (age > LINK_LIFETIME_MS) {
        link.alpha -= 0.03;
        if (link.alpha <= 0) {
          this.links.splice(i, 1);
          continue;
        }
      }

      // Spring pull together
      const restDist = 65;
      const diff = dist - restDist;
      const force = diff * 0.008; // gentle spring
      const nx = (link.b.x - link.a.x) / dist;
      const ny = (link.b.y - link.a.y) / dist;

      if (!link.a.isDragged) {
        link.a.vx += nx * force;
        link.a.vy += ny * force;
      }
      if (!link.b.isDragged) {
        link.b.vx -= nx * force;
        link.b.vy -= ny * force;
      }
    }
  }

  /**
   * Draw creatures, ink links, and handwriting labels.
   */
  public draw(now = performance.now()): void {
    if (!this.ctx || !this.canvas) return;
    const c = this.ctx;
    const W = this.width;
    const H = this.height;

    c.clearRect(0, 0, W, H);

    // 1. Draw Links (hand-drawn ink line connecting creatures)
    for (const link of this.links) {
      c.save();
      c.globalAlpha = Math.max(0, Math.min(1, link.alpha * 0.85));
      c.strokeStyle = this.inkColor;
      c.lineWidth = 1.6;
      c.lineCap = 'round';

      // Hand-drawn curved link with subtle sinusoidal wobble
      const mx = (link.a.x + link.b.x) / 2;
      const my = (link.a.y + link.b.y) / 2;
      const dx = link.b.x - link.a.x;
      const dy = link.b.y - link.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;
      const wobble = Math.sin(now * 0.004 + (link.a.id + link.b.id)) * 4;
      const cx = mx + perpX * wobble;
      const cy = my + perpY * wobble;

      c.beginPath();
      c.moveTo(link.a.x, link.a.y);
      c.quadraticCurveTo(cx, cy, link.b.x, link.b.y);
      c.stroke();
      c.restore();
    }

    // 2. Draw Creatures and Skill Names
    for (const cr of this.creatures) {
      c.save();
      c.globalAlpha = 0.9;
      c.strokeStyle = this.inkColor;
      c.fillStyle = this.inkColor;
      c.lineWidth = 1.6;
      c.lineCap = 'round';
      c.lineJoin = 'round';

      // If dragged, draw stretched ink tail trailing toward cr.tailX, cr.tailY
      if (cr.isDragged) {
        c.beginPath();
        c.moveTo(cr.x, cr.y);
        c.lineTo(cr.tailX, cr.tailY);
        c.lineWidth = 2.4;
        c.stroke();
        c.lineWidth = 1.6;
      }

      // Wobbly creature body (sinusoidal polar radius)
      c.beginPath();
      const segments = 12;
      for (let i = 0; i <= segments; i++) {
        const q = (i / segments) * Math.PI * 2;
        const rad =
          cr.r *
          (1 +
            0.15 * Math.sin(q * 3 + cr.ph) +
            0.08 * Math.sin(q * 2 - cr.ph * 1.3));
        const px = cr.x + Math.cos(q) * rad;
        const py = cr.y + Math.sin(q) * rad * 0.92;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();

      // Two eyes facing heading
      const h = cr.a;
      for (const side of [-1, 1] as const) {
        const ex =
          cr.x +
          Math.cos(h) * cr.r * 0.35 +
          Math.cos(h + Math.PI / 2) * side * cr.r * 0.3;
        const ey =
          cr.y +
          Math.sin(h) * cr.r * 0.35 +
          Math.sin(h + Math.PI / 2) * side * cr.r * 0.3;
        c.beginPath();
        c.arc(ex, ey, 2.0, 0, Math.PI * 2);
        c.fill();
      }

      // Handwritten skill name with crisp background halo
      c.font = '20px Hand, Fallback, "Comic Sans MS", cursive';
      c.textBaseline = 'middle';
      const textX = cr.x + cr.r + 7;
      const textY = cr.y;

      // Ensure text stays visible within canvas width
      const metrics = c.measureText(cr.name);
      c.save();
      c.strokeStyle = this.paperColor;
      c.lineWidth = 4;
      c.lineJoin = 'round';
      if (textX + metrics.width > W - 10) {
        c.textAlign = 'right';
        c.strokeText(cr.name, cr.x - cr.r - 7, textY);
        c.fillText(cr.name, cr.x - cr.r - 7, textY);
      } else {
        c.textAlign = 'left';
        c.strokeText(cr.name, textX, textY);
        c.fillText(cr.name, textX, textY);
      }
      c.restore();

      c.restore();
    }
  }

  public isDrivenExternally = false;

  private startLoop(): void {
    if (this.isDrivenExternally) return;
    if (this.animId === null && this.isVisible && this.isTabVisible) {
      const loop = (t: number) => {
        this.stepPhysics(-9999, -9999, 0, false, t);
        this.draw(t);
        if (this.isVisible && this.isTabVisible) {
          this.animId = requestAnimationFrame(loop);
        } else {
          this.animId = null;
        }
      };
      this.animId = requestAnimationFrame(loop);
    }
  }

  private stopLoop(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public destroy(): void {
    this.stopLoop();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export const skillsEcosystem = new SkillsEcosystem();
