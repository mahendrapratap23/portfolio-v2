/**
 * ink.ts — Canvas ink: pen trail, drips, blots, bead, pen cursor.
 *
 * All values from spec:
 *  - Segments: live 5000ms, fade, cap 1200
 *  - Line width: max(1.2, 7 - speed*0.35), smoothed with factor 0.3
 *  - Idle bead: grows after 20 idle frames at rate 0.04, drips at bead>=7
 *  - Drip gravity: 0.12, thinning by 0.04/frame
 *  - Ink blot: irregular 18-point edge, radius grows sqrt(t/800) over 800ms,
 *    fades over 6000ms at 0.85 alpha, 60% chance to spawn a creature
 */

import { type PenState } from './physics.js';
import { born } from './creatures.js';

// ── Types ──────────────────────────────────────────────────────────

export interface Segment {
  a: number; b: number; // from x,y
  c: number; d: number; // to x,y
  w: number;            // line width
  t: number;            // timestamp ms
}

export interface Drip {
  x: number;
  y: number;
  vy: number;
  w: number;
}

export interface Blot {
  x: number;
  y: number;
  t: number;           // birth timestamp
  R: number;           // max radius
  n: number[];         // 18 random values for irregular edge
}

// ── State ──────────────────────────────────────────────────────────

export const segs: Segment[] = [];
export const drips: Drip[] = [];
export const blots: Blot[] = [];

let maxSegs = 1200;

export function reduceInkQuality(): void {
  maxSegs = 600;
  while (segs.length > maxSegs) segs.shift();
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ── Blot spawning ──────────────────────────────────────────────────

export function spawnBlot(x: number, y: number, now: number, W: number, H: number): void {
  blots.push({
    x,
    y,
    t: now,
    R: rnd(22, 38),
    n: Array.from({ length: 18 }, Math.random),
  });
  if (Math.random() < 0.6) born(x, y, W, H);
}

// ── Ink step (called once per fixed tick) ─────────────────────────

export function stepInk(pen: PenState, now: number, H: number): void {
  const ox = pen.ox;
  const oy = pen.oy;

  // Pen trail
  if (pen.seen && pen.sp > 0.3) {
    // Smooth line width toward target (thinner trail on touch)
    const targetW = pen.isTouch ? Math.max(0.8, 3.5 - pen.sp * 0.2) : Math.max(1.2, 7 - pen.sp * 0.35);
    pen.w += (targetW - pen.w) * 0.3;
    segs.push({ a: ox, b: oy, c: pen.x, d: pen.y, w: pen.w, t: now });
    if (segs.length > maxSegs) segs.shift();
    pen.idle = 0;
    pen.bead = 0;
  } else if (pen.seen) {
    // Growing ink bead when idle
    pen.idle++;
    if (pen.idle > 20) pen.bead = Math.min(8, (pen.idle - 20) * 0.04);
    // Drip when bead reaches 7
    if (pen.bead >= 7) {
      drips.push({ x: pen.x, y: pen.y, vy: 0, w: 6 });
      pen.idle = 20;
      pen.bead = 0;
    }
  }

  // Step drips
  for (let i = drips.length - 1; i >= 0; i--) {
    const drip = drips[i]!;
    drip.vy += 0.12;
    const y0 = drip.y;
    drip.y += drip.vy;
    drip.w -= 0.04;
    segs.push({
      a: drip.x,
      b: y0,
      c: drip.x,
      d: drip.y,
      w: Math.max(0.8, drip.w),
      t: now,
    });
    if (drip.w < 1 || drip.y > H) drips.splice(i, 1);
  }
}

// ── Drawing ────────────────────────────────────────────────────────

/**
 * Draw all ink onto the canvas context.
 * Call after clearing the canvas each frame.
 */
export function drawInk(
  c: CanvasRenderingContext2D,
  INK: string,
  PAP: string,
  pen: PenState,
  now: number
): void {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.fillStyle = INK;

  // Expire old segments
  while (segs.length && now - segs[0]!.t > 5000) segs.shift();

  // Draw segments with fade
  for (const s of segs) {
    c.globalAlpha = 1 - (now - s.t) / 5000;
    c.lineWidth = s.w;
    c.beginPath();
    c.moveTo(s.a, s.b);
    c.lineTo(s.c, s.d);
    c.stroke();
  }

  // Draw blots
  for (let i = blots.length - 1; i >= 0; i--) {
    const b = blots[i]!;
    const age = now - b.t;
    if (age > 6000) { blots.splice(i, 1); continue; }
    const r = b.R * Math.sqrt(Math.min(1, age / 800));
    c.globalAlpha = 0.85 * (1 - age / 6000);
    c.beginPath();
    b.n.forEach((v, j) => {
      const q = (j / b.n.length) * Math.PI * 2;
      const m = r * (0.7 + 0.6 * v);
      if (j === 0) c.moveTo(b.x + Math.cos(q) * m, b.y + Math.sin(q) * m);
      else c.lineTo(b.x + Math.cos(q) * m, b.y + Math.sin(q) * m);
    });
    c.closePath();
    c.fill();
  }

  c.globalAlpha = 1;

  // Ink bead
  if (pen.seen && pen.bead > 0) {
    c.beginPath();
    c.arc(pen.x, pen.y + pen.bead * 0.4, pen.bead, 0, Math.PI * 2);
    c.fill();
  }

  // Pen cursor (fountain pen nib) — hidden on touch devices
  if (pen.seen && !pen.isTouch) {
    c.save();
    c.translate(pen.x, pen.y);
    c.rotate(0.5);
    c.fillStyle = PAP;
    c.lineWidth = 2;
    c.strokeStyle = INK;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-5, -16);
    c.lineTo(-5, -70);
    c.lineTo(5, -70);
    c.lineTo(5, -16);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-3.4, -11);
    c.lineTo(3.4, -11);
    c.closePath();
    c.fill();
    c.restore();
  }
}
