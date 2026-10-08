/**
 * bootstrap.ts — Physics engine entry point.
 *
 * Wires together: letters, pen, ink, creatures, canvas, eye-tracking.
 * Fixed-timestep loop at 60 Hz (FIXED_DT = 16.67 ms accumulator).
 */

import { type PenState, type LetterBody, FIXED_DT, penStep } from './physics.js';
import { letters, initLetters, measureLetters, stepLetters, kickLetters } from './letters.js';
import { segs, drips, blots, spawnBlot, stepInk, drawInk } from './ink.js';
import { cells, initCreatures, stepCreatures, drawCreatures } from './creatures.js';

// Suppress unused-locals for re-exports used indirectly
void segs; void drips; void blots; void letters; void cells;

// ── Canvas setup ───────────────────────────────────────────────────

const cv = document.getElementById('cv') as HTMLCanvasElement;
const c = cv.getContext('2d')!;
let W = 0, H = 0;
let INK = '#161616', PAP = '#fbfaf6';

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function readColors(): void {
  const s = getComputedStyle(document.documentElement);
  INK = s.getPropertyValue('--ink').trim();
  PAP = s.getPropertyValue('--paper').trim();
}

sizeCanvas();
readColors();

// ── Pen state ──────────────────────────────────────────────────────

const pen: PenState = {
  x: W / 2,
  y: H / 2,
  ox: W / 2,
  oy: H / 2,
  tx: W / 2,
  ty: H / 2,
  vx: 0,
  vy: 0,
  sp: 0,
  w: 5,
  idle: 0,
  bead: 0,
  seen: false,
};

// ── Event listeners ────────────────────────────────────────────────

addEventListener('pointermove', (e) => {
  if (!pen.seen) {
    pen.x = pen.ox = e.clientX;
    pen.y = pen.oy = e.clientY;
    pen.seen = true;
  }
  pen.tx = e.clientX;
  pen.ty = e.clientY;
});

addEventListener('pointerdown', (e) => {
  pen.tx = e.clientX;
  pen.ty = e.clientY;
  pen.seen = true;
  const now = performance.now();
  spawnBlot(e.clientX, e.clientY, now, W, H);
});

addEventListener('resize', () => {
  sizeCanvas();
  measureLetters();
});

matchMedia('(prefers-color-scheme:dark)').addEventListener('change', readColors);

// Gravity mode integration with main.ts gravity button
let gravityOn = false;
addEventListener('gravity', (e) => {
  gravityOn = (e as CustomEvent<boolean>).detail;
  if (gravityOn) kickLetters();
});

// ── Letter init ────────────────────────────────────────────────────

let lettersReady = false;

initLetters();
initCreatures(W, H);

document.fonts.ready.then(() => {
  measureLetters();
  lettersReady = true;
});

// ── Eye tracking ───────────────────────────────────────────────────

const eyeL = document.getElementById('eye-l') as SVGCircleElement | null;
const eyeR = document.getElementById('eye-r') as SVGCircleElement | null;

function updateEyes(): void {
  if (!eyeL || !eyeR || !pen.seen) return;
  for (const eye of [eyeL, eyeR]) {
    const parent = eye.previousElementSibling as SVGCircleElement;
    if (!parent) continue;
    const b = parent.getBoundingClientRect();
    const dx = pen.x - (b.left + b.width / 2);
    const dy = pen.y - (b.top + b.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const m = Math.min(7, d / 25);
    eye.style.transform = `translate(${(dx / d) * m}px,${(dy / d) * m}px)`;
  }
}

// ── Draw ───────────────────────────────────────────────────────────

function draw(now: number): void {
  c.clearRect(0, 0, W, H);

  drawInk(c, INK, PAP, pen, now);
  drawCreatures(c, INK);
  updateEyes();
}

// ── Fixed-timestep loop ────────────────────────────────────────────

let last = performance.now();
let acc = 0;

function loop(t: number): void {
  acc += Math.min(t - last, 50); // clamp max accumulation to avoid spiral
  last = t;

  while (acc >= FIXED_DT) {
    acc -= FIXED_DT;
    penStep(pen);
    stepInk(pen, t, H);
    stepCreatures(pen.x, pen.y, pen.sp, pen.seen, W, H);
    if (lettersReady) stepLetters(pen, gravityOn);
  }

  draw(t);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// ── Expose gravity toggle for unit tests ──────────────────────────
export type { LetterBody };
export { gravityOn, lettersReady };
