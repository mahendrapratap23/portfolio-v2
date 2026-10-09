/**
 * sheet.ts — Living physics membrane background.
 *
 * Dots are simulated as a stretched membrane with a heightfield h and velocity v.
 * Waves propagate via 2D discrete wave step on a 60 Hz accumulator.
 * Responsive to pen dent, touch drags, click/tap ripples, and tilt slope.
 * Sleeps when max energy < 0.01 for near-zero idle CPU.
 */

import { type PenState } from './physics.js';

export interface SheetConfig {
  grid: number;
  maxDots: number;
  dpr: number;
}

export class LivingSheet {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Grid dimensions
  public cols = 0;
  public rows = 0;
  public totalDots = 0;
  public step = 28;
  public offsetX = 0;
  public offsetY = 0;

  // Physics buffers
  public h: Float32Array = new Float32Array(0);
  public v: Float32Array = new Float32Array(0);

  // State
  public awake = true;
  public sleeping = false;
  public qualityDoubled = false;
  public disabled = false; // Dropped to CSS fallback if frame > 28ms
  private stepCount = 0;

  // Viewport
  public width = 0;
  public height = 0;

  // Styling
  private dotColor = '#c9cedb';
  private isCoarse = false;

  constructor() {
    this.isCoarse = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  }

  public init(canvasId = 'sheet-cv'): boolean {
    if (typeof document === 'undefined') return false;

    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!this.canvas) return false;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return false;

    this.readStyles();
    this.allocateGrid(innerWidth, innerHeight);

    document.body.classList.add('sheet-active');

    // Draw initial static frame at rest
    this.render();
    return true;
  }

  public readStyles(): void {
    if (typeof document === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    const parsedDot = cs.getPropertyValue('--dot').trim();
    if (parsedDot) {
      this.dotColor = parsedDot;
    }

    const gridVal = parseFloat(cs.getPropertyValue('--grid')) || (this.isCoarse ? 34 : 28);
    this.step = this.qualityDoubled ? gridVal * 2 : gridVal;
    if (this.sleeping) {
      this.render();
    }
  }

  public allocateGrid(w: number, h: number): void {
    this.width = w;
    this.height = h;

    const baseToken = this.isCoarse ? 34 : 28;
    let effectiveStep = this.qualityDoubled ? baseToken * 2 : baseToken;
    const maxDotsCap = this.isCoarse ? 1200 : 4000;

    // Estimate cols/rows with 1 cell margin
    let testCols = Math.ceil(w / effectiveStep) + 2;
    let testRows = Math.ceil(h / effectiveStep) + 2;

    if (testCols * testRows > maxDotsCap) {
      effectiveStep = Math.max(
        effectiveStep,
        Math.ceil(Math.sqrt((w * h) / (maxDotsCap * 0.85)))
      );
      testCols = Math.ceil(w / effectiveStep) + 2;
      testRows = Math.ceil(h / effectiveStep) + 2;
    }

    this.step = effectiveStep;
    this.cols = testCols;
    this.rows = testRows;
    this.totalDots = this.cols * this.rows;

    this.offsetX = -this.step;
    this.offsetY = -this.step;

    this.h = new Float32Array(this.totalDots);
    this.v = new Float32Array(this.totalDots);

    if (this.canvas && this.ctx) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.awake = false;
    this.sleeping = true;
  }

  public resizeHeightOnly(h: number): void {
    if (h === this.height) return;
    this.height = h;
    if (this.canvas && this.ctx) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.canvas.height = h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  public wake(): void {
    if (this.disabled) return;
    this.awake = true;
    this.sleeping = false;
  }

  /**
   * Apply a dent to the membrane around pointer (px, py).
   */
  public applyDent(
    px: number,
    py: number,
    sp: number,
    isTouch = false
  ): void {
    if (this.disabled) return;
    this.wake();

    const radius = isTouch ? 110 : 90;
    const depth = Math.min(3.2, 0.5 + sp * 0.16);

    // Approximate cell bounding box to avoid checking all dots
    const minC = Math.max(1, Math.floor((px - radius - this.offsetX) / this.step));
    const maxC = Math.min(this.cols - 2, Math.ceil((px + radius - this.offsetX) / this.step));
    const minR = Math.max(1, Math.floor((py - radius - this.offsetY) / this.step));
    const maxR = Math.min(this.rows - 2, Math.ceil((py + radius - this.offsetY) / this.step));

    const cols = this.cols;
    const h = this.h;
    const radSq = radius * radius;

    for (let r = minR; r <= maxR; r++) {
      const dy = r * this.step + this.offsetY - py;
      const dy2 = dy * dy;
      const rowOffset = r * cols;

      for (let c = minC; c <= maxC; c++) {
        const dx = c * this.step + this.offsetX - px;
        const d2 = dx * dx + dy2;
        if (d2 < radSq) {
          const dist = Math.sqrt(d2);
          const falloff = 1 - dist / radius;
          const factor = falloff * falloff;
          const idx = rowOffset + c;
          h[idx] = Math.max(-8, h[idx] - depth * factor);
        }
      }
    }
  }

  /**
   * Apply a shockwave / ripple impulse at (px, py).
   */
  public applyImpulse(px: number, py: number, strength = 4.5): void {
    if (this.disabled) return;
    this.wake();

    const radius = 60;
    const radSq = radius * radius;
    const minC = Math.max(1, Math.floor((px - radius - this.offsetX) / this.step));
    const maxC = Math.min(this.cols - 2, Math.ceil((px + radius - this.offsetX) / this.step));
    const minR = Math.max(1, Math.floor((py - radius - this.offsetY) / this.step));
    const maxR = Math.min(this.rows - 2, Math.ceil((py + radius - this.offsetY) / this.step));

    const cols = this.cols;
    const v = this.v;

    for (let r = minR; r <= maxR; r++) {
      const dy = r * this.step + this.offsetY - py;
      const dy2 = dy * dy;
      const rowOffset = r * cols;

      for (let c = minC; c <= maxC; c++) {
        const dx = c * this.step + this.offsetX - px;
        const d2 = dx * dx + dy2;
        if (d2 < radSq) {
          const dist = Math.sqrt(d2);
          const falloff = 1 - dist / radius;
          const idx = rowOffset + c;
          v[idx] -= strength * falloff;
        }
      }
    }
  }

  /**
   * Step wave physics by one fixed 60 Hz tick.
   * v += (avg_4 - h) * 0.25; v *= 0.985; h += v
   */
  public stepPhysics(
    pen: PenState,
    effectiveGx = 0,
    effectiveGy = 0,
    tiltActive = false
  ): void {
    if (this.disabled) return;

    // Apply pen dent if active and within or near viewport
    if (pen.seen && (pen.sp > 0.1 || pen.isTouch)) {
      this.applyDent(pen.x, pen.y, pen.sp, pen.isTouch);
    }

    if (!this.awake) return;

    // Halve wave iterations when quality is reduced
    if (this.qualityDoubled && (this.stepCount++ % 2 !== 0)) return;

    const cols = this.cols;
    const rows = this.rows;
    const h = this.h;
    const v = this.v;

    // Pass 1: compute velocity field from unchanged heightfield
    for (let r = 1; r < rows - 1; r++) {
      const rowOffset = r * cols;
      const prevRow = (r - 1) * cols;
      const nextRow = (r + 1) * cols;
      const tiltYBias = tiltActive ? (effectiveGy - 0.7) * 0.005 : 0;

      for (let c = 1; c < cols - 1; c++) {
        const idx = rowOffset + c;
        const avg4 =
          (h[idx - 1] + h[idx + 1] + h[prevRow + c] + h[nextRow + c]) * 0.25;

        let acc = (avg4 - h[idx]) * 0.25;

        if (tiltActive) {
          const tiltXBias = -effectiveGx * 0.005;
          acc += tiltXBias * ((c / cols) - 0.5) + tiltYBias * ((r / rows) - 0.5);
        }

        v[idx] = (v[idx] + acc) * 0.985;
      }
    }

    // Pass 2: integrate heightfield and measure total active energy
    let maxEnergy = 0;
    for (let r = 1; r < rows - 1; r++) {
      const rowOffset = r * cols;
      for (let c = 1; c < cols - 1; c++) {
        const idx = rowOffset + c;
        h[idx] = (h[idx] + v[idx]) * 0.982; // Damps waves cleanly back to rest
        const energy = Math.abs(h[idx]) + Math.abs(v[idx]);
        if (energy > maxEnergy) maxEnergy = energy;
      }
    }

    // Sleep condition: when max absolute h and v are below 0.01 and pen is still, go to sleep
    if (maxEnergy < 0.01 && pen.sp < 0.1) {
      this.awake = false;
      this.sleeping = true;
      // Zero out tiny residual floating-point noise
      h.fill(0);
      v.fill(0);
      this.render();
    }
  }

  /**
   * Sample membrane height at viewport coordinate (vx, vy).
   * Uses bilinear interpolation.
   */
  public sampleHeight(vx: number, vy: number): number {
    if (!this.awake || this.disabled) return 0;

    const c = (vx - this.offsetX) / this.step;
    const r = (vy - this.offsetY) / this.step;

    const c0 = Math.floor(c);
    const r0 = Math.floor(r);
    const c1 = c0 + 1;
    const r1 = r0 + 1;

    if (c0 < 0 || c1 >= this.cols || r0 < 0 || r1 >= this.rows) return 0;

    const fx = c - c0;
    const fy = r - r0;

    const cols = this.cols;
    const h = this.h;

    const h00 = h[r0 * cols + c0];
    const h10 = h[r0 * cols + c1];
    const h01 = h[r1 * cols + c0];
    const h11 = h[r1 * cols + c1];

    const top = h00 + (h10 - h00) * fx;
    const bottom = h01 + (h11 - h01) * fx;
    return top + (bottom - top) * fy;
  }

  /**
   * Render living dot sheet to canvas.
   * Batches dots into 4 size buckets to minimize fill calls.
   */
  public render(): void {
    if (this.disabled || !this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const cols = this.cols;
    const rows = this.rows;
    const step = this.step;
    const offX = this.offsetX;
    const offY = this.offsetY;
    const h = this.h;

    ctx.clearRect(0, 0, this.width, this.height);

    // 4 radius buckets for batching
    // Bucket 0: pressed (r = 0.7px)
    // Bucket 1: small (r = 0.95px)
    // Bucket 2: base rest (r = 1.15px)
    // Bucket 3: crest / raised (r = 1.45px)
    const b0 = new Path2D();
    const b1 = new Path2D();
    const b2 = new Path2D();
    const b3 = new Path2D();

    let count0 = 0, count1 = 0, count2 = 0, count3 = 0;

    const isRest = !this.awake || this.sleeping;

    for (let r = 1; r < rows - 1; r++) {
      const ry = r * step + offY;
      const rowOffset = r * cols;

      for (let c = 1; c < cols - 1; c++) {
        const rx = c * step + offX;
        const idx = rowOffset + c;

        let dotX = rx;
        let dotY = ry;
        let dotR = 1.2; // Standard rest dot radius matching CSS 1.2px dot

        if (!isRest) {
          const val = h[idx];

          // Compute height gradient for lateral stretch displacement (max 6px)
          const dh_dx = (h[idx + 1] - h[idx - 1]) * 0.5;
          const dh_dy = (h[idx + cols] - h[idx - cols]) * 0.5;

          const dispX = Math.max(-6, Math.min(6, dh_dx * 2.8));
          const dispY = Math.max(-6, Math.min(6, dh_dy * 2.8));

          dotX += dispX;
          dotY += dispY;

          // Scale radius with height: pressed shrink, raised grow
          dotR = Math.max(0.6, Math.min(1.8, 1.2 + val * 0.16));
        }

        // Assign to bucket
        if (dotR < 0.85) {
          b0.moveTo(dotX + 0.7, dotY);
          b0.arc(dotX, dotY, 0.7, 0, Math.PI * 2);
          count0++;
        } else if (dotR < 1.05) {
          b1.moveTo(dotX + 0.95, dotY);
          b1.arc(dotX, dotY, 0.95, 0, Math.PI * 2);
          count1++;
        } else if (dotR < 1.35) {
          b2.moveTo(dotX + 1.2, dotY);
          b2.arc(dotX, dotY, 1.2, 0, Math.PI * 2);
          count2++;
        } else {
          b3.moveTo(dotX + 1.45, dotY);
          b3.arc(dotX, dotY, 1.45, 0, Math.PI * 2);
          count3++;
        }
      }
    }

    ctx.fillStyle = this.dotColor;
    if (count0 > 0) ctx.fill(b0);
    if (count1 > 0) ctx.fill(b1);
    if (count2 > 0) ctx.fill(b2);
    if (count3 > 0) ctx.fill(b3);
  }

  public doubleGridStep(): void {
    if (this.qualityDoubled) return;
    this.qualityDoubled = true;
    this.allocateGrid(this.width, this.height);
    console.debug('Adaptive quality: Doubled living sheet grid step to maintain 60 FPS.');
  }

  public disableToCssFallback(): void {
    this.disabled = true;
    document.body.classList.remove('sheet-active');
    if (this.canvas) this.canvas.style.display = 'none';
    console.debug('Adaptive quality: Dropped living sheet to static CSS grid due to high frame time.');
  }
}

export const sheet = new LivingSheet();
if (typeof window !== 'undefined') {
  (window as unknown as { __sheet: LivingSheet }).__sheet = sheet;
}
