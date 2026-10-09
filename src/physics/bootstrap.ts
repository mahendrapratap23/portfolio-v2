/**
 * bootstrap.ts — Physics engine entry point.
 *
 * Wires together: letters, pen, ink, creatures, canvas, eye-tracking.
 * Fixed-timestep loop at 60 Hz (FIXED_DT = 16.67 ms accumulator).
 * Optimized for mobile touch smoothness, adaptive quality, and tilt mode.
 */

import { type PenState, type LetterBody, FIXED_DT, GRAVITY, penStep } from './physics.js';
import { letters, initLetters, measureLetters, stepLetters, kickLetters, shockwaveLetters } from './letters.js';
import { segs, drips, blots, spawnBlot, stepInk, drawInk, reduceInkQuality } from './ink.js';
import { cells, initCreatures, stepCreatures, drawCreatures, reduceCreaturesQuality } from './creatures.js';
import {
  initPortrait,
  stepPortraitPhysics,
  drawPortrait,
  shockwavePortrait,
  reducePortraitQuality,
  readPortraitColors,
} from './portrait.js';
import { sheet } from './sheet.js';

// Suppress unused-locals for re-exports used indirectly
void segs; void drips; void blots; void letters; void cells; void sheet;

// ── Canvas setup ───────────────────────────────────────────────────

const cv = document.getElementById('cv') as HTMLCanvasElement;
const c = cv.getContext('2d')!;
let W = 0, H = 0;
let INK = '#1b2340', PAP = '#ffffff';

function sizeCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function sizeCanvasHeightOnly(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const newH = innerHeight;
  if (newH === H) return;
  H = newH;
  cv.height = H * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function readColors(): void {
  const s = getComputedStyle(document.documentElement);
  INK = s.getPropertyValue('--ink').trim() || '#1b2340';
  PAP = s.getPropertyValue('--paper').trim() || '#ffffff';
  sheet.readStyles();
  readPortraitColors();
}

sizeCanvas();
sheet.init('sheet-cv');
readColors();

// ── Pen state ──────────────────────────────────────────────────────

const isCoarse = matchMedia('(pointer: coarse)').matches;

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
  isTouch: isCoarse,
};

// ── Pointer Event listeners (Passive, touch-optimized) ─────────────

addEventListener('pointerdown', (e) => {
  const isTouch = e.pointerType === 'touch' || isCoarse;
  pen.isTouch = isTouch;
  pen.seen = true;

  if (isTouch) {
    pen.x = pen.ox = pen.tx = e.clientX;
    pen.y = pen.oy = pen.ty = e.clientY;
    pen.sp = 0;
  } else {
    pen.tx = e.clientX;
    pen.ty = e.clientY;
  }

  const now = performance.now();
  spawnBlot(e.clientX, e.clientY, now, W, H);
  shockwaveLetters(e.clientX + scrollX, e.clientY + scrollY, 6, 220);
  sheet.applyImpulse(e.clientX, e.clientY, 4.5);

  const portraitCanvas = document.getElementById('portrait-canvas') as HTMLCanvasElement | null;
  if (portraitCanvas) {
    const rect = portraitCanvas.getBoundingClientRect();
    shockwavePortrait(e.clientX - rect.left, e.clientY - rect.top, 6, 220);
  }

  dispatchEvent(new CustomEvent('shockwave', { detail: { x: e.clientX, y: e.clientY } }));
}, { passive: true });

addEventListener('pointermove', (e) => {
  sheet.wake();
  const isTouch = e.pointerType === 'touch' || isCoarse;
  pen.isTouch = isTouch;

  if (!pen.seen) {
    pen.x = pen.ox = e.clientX;
    pen.y = pen.oy = e.clientY;
    pen.seen = true;
  }

  if (isTouch) {
    pen.ox = pen.x;
    pen.oy = pen.y;
    pen.tx = pen.x = e.clientX;
    pen.ty = pen.y = e.clientY;
    pen.vx = pen.x - pen.ox;
    pen.vy = pen.y - pen.oy;
    pen.sp = Math.hypot(pen.vx, pen.vy);
  } else {
    pen.tx = e.clientX;
    pen.ty = e.clientY;
  }
}, { passive: true });

addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch' || isCoarse) {
    pen.sp = 0;
    pen.vx = 0;
    pen.vy = 0;
  }
}, { passive: true });

addEventListener('pointercancel', (e) => {
  // If finger drag turns into a scroll or is cancelled, end cleanly:
  // no stuck letters, no stuck pen
  if (e.pointerType === 'touch' || isCoarse) {
    pen.seen = false;
    pen.sp = 0;
    pen.vx = 0;
    pen.vy = 0;
  }
}, { passive: true });

// ── Viewport & Resize Management ───────────────────────────────────

let lastWidth = innerWidth;
let resizeTimer: number | null = null;

function handleResize(): void {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const curW = innerWidth;
    if (curW !== lastWidth) {
      lastWidth = curW;
      sizeCanvas();
      sheet.allocateGrid(curW, innerHeight);
      measureLetters();
      dispatchEvent(new CustomEvent('widthresize', { detail: curW }));
    } else {
      sizeCanvasHeightOnly();
      sheet.resizeHeightOnly(innerHeight);
    }
  }, 200);
}

addEventListener('resize', handleResize, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleResize, { passive: true });
}

addEventListener('scroll', () => sheet.wake(), { passive: true });

matchMedia('(prefers-color-scheme:dark)').addEventListener('change', readColors);

if (typeof MutationObserver !== 'undefined') {
  const themeObserver = new MutationObserver(() => {
    readColors();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

// ── Gravity & Tilt Mode ────────────────────────────────────────────

let gravityOn = false;
let tiltActive = false;
let tiltGx = 0;
let tiltGy = GRAVITY;

addEventListener('gravity', (e) => {
  gravityOn = (e as CustomEvent<boolean>).detail;
  if (gravityOn) kickLetters();
});

addEventListener('tiltchange', (e) => {
  const d = (e as CustomEvent<{ active: boolean; gx: number; gy: number }>).detail;
  tiltActive = d.active;
  tiltGx = d.gx;
  tiltGy = d.gy;
  sheet.wake();
});

// ── Letter init ────────────────────────────────────────────────────

let lettersReady = false;

initLetters();
initCreatures(W, H);
initPortrait();
registerDotReducer(reducePortraitQuality);

document.fonts.ready.then(() => {
  measureLetters();
  lettersReady = true;
});

// ── Eye tracking ───────────────────────────────────────────────────

const eyeL = document.getElementById('eye-l') as SVGCircleElement | null;
const eyeR = document.getElementById('eye-r') as SVGCircleElement | null;
const faceSvg = document.querySelector('.face');
let faceVisible = true;

if (faceSvg && 'IntersectionObserver' in window) {
  const eyeObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      faceVisible = entry.isIntersecting;
    }
  });
  eyeObserver.observe(faceSvg);
}

let prevEyeX = -999;
let prevEyeY = -999;

function updateEyes(): void {
  if (!eyeL || !eyeR || !pen.seen || !faceVisible) return;
  const parent = eyeL.previousElementSibling as SVGCircleElement | null;
  if (!parent) return;
  const b = parent.getBoundingClientRect();
  const dx = pen.x - (b.left + b.width / 2);
  const dy = pen.y - (b.top + b.height / 2);
  const d = Math.hypot(dx, dy) || 1;
  const m = Math.min(7, d / 25);
  const ex = (dx / d) * m;
  const ey = (dy / d) * m;

  if (Math.abs(ex - prevEyeX) > 0.1 || Math.abs(ey - prevEyeY) > 0.1) {
    prevEyeX = ex;
    prevEyeY = ey;
    const tf = `translate(${ex.toFixed(1)}px,${ey.toFixed(1)}px)`;
    eyeL.style.transform = tf;
    eyeR.style.transform = tf;
  }
}

// ── Adaptive Quality ───────────────────────────────────────────────

const frameTimes: number[] = [];
let qualityReduced = false;
let dotReducer: (() => void) | null = null;

export function registerDotReducer(fn: () => void): void {
  dotReducer = fn;
}

function checkAdaptiveQuality(delta: number): void {
  if (qualityReduced) return;
  frameTimes.push(delta);
  if (frameTimes.length > 60) frameTimes.shift();

  if (frameTimes.length === 60) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / 60;
    if (avg > 20) {
      qualityReduced = true;
      reduceCreaturesQuality();
      reduceInkQuality();
      dotReducer?.();
      sheet.doubleGridStep();
      console.debug('Adaptive quality triggered: reducing creature count, segment cap, and dot count by half.');
    }
    if (avg > 28) {
      sheet.disableToCssFallback();
    }
  }
}

// ── Draw ───────────────────────────────────────────────────────────

function draw(now: number): void {
  if (sheet.awake) {
    sheet.render();
  }
  c.clearRect(0, 0, W, H);
  drawInk(c, INK, PAP, pen, now);
  drawCreatures(c, INK);
  drawPortrait();
  updateEyes();
}

// ── Fixed-timestep loop & Pausing ──────────────────────────────────

let last = performance.now();
let acc = 0;
let animId: number | null = null;
let isTabVisible = !document.hidden;
let isCanvasVisible = true;

function loop(t: number): void {
  const frameDelta = t - last;
  checkAdaptiveQuality(frameDelta);

  acc += Math.min(frameDelta, 50); // clamp max accumulation to avoid spiral
  last = t;

  const effectiveGx = tiltActive ? tiltGx : 0;
  const effectiveGy = tiltActive ? tiltGy : GRAVITY;
  const isGrav = gravityOn || tiltActive;

  while (acc >= FIXED_DT) {
    acc -= FIXED_DT;
    penStep(pen);
    stepInk(pen, t, H);
    stepCreatures(pen.x, pen.y, pen.sp, pen.seen, W, H);
    stepPortraitPhysics(pen, isCoarse, effectiveGx, effectiveGy, tiltActive);
    sheet.stepPhysics(pen, effectiveGx, effectiveGy, tiltActive);
    if (lettersReady) {
      stepLetters(
        pen,
        isGrav,
        effectiveGx,
        effectiveGy,
        (vx, vy) => sheet.sampleHeight(vx, vy),
        sheet.awake
      );
    }
  }

  draw(t);

  if (isTabVisible && isCanvasVisible) {
    animId = requestAnimationFrame(loop);
  } else {
    animId = null;
  }
}

function startLoop(): void {
  if (animId === null && isTabVisible && isCanvasVisible) {
    last = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function stopLoop(): void {
  if (animId !== null) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

// Tab visibility
document.addEventListener('visibilitychange', () => {
  isTabVisible = !document.hidden;
  if (isTabVisible) startLoop();
  else stopLoop();
}, { passive: true });

// Canvas intersection
if ('IntersectionObserver' in window) {
  const canvasObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === cv) {
        isCanvasVisible = entry.isIntersecting;
        if (isCanvasVisible) startLoop();
        else stopLoop();
      }
    }
  });
  canvasObserver.observe(cv);
}

startLoop();

// ── Exports ────────────────────────────────────────────────────────
export type { LetterBody };
export { gravityOn, lettersReady, pen };
