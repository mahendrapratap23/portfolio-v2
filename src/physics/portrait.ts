/**
 * portrait.ts — Dot portrait + Name morphing physics engine.
 *
 * Implements:
 * 1. Image sampling from /public/images/head-bw-cutout.png (blur 1.5px, luminance grid)
 * 2. Name sampling for "mahendra pratap" in handwritten font
 * 3. Dot physics: spring 0.06, damping 0.85, repel 110 (140 on touch), shockwave 6/220px, idle shimmer 0.15px
 * 4. 3-state morph: PORTRAIT -> NAME -> PHOTO (600ms crossfade)
 * 5. Float32Array storage, zero allocation per frame
 * 6. Responsive resize on width change only
 */

import { type PenState } from './physics.js';

export type PortraitState = 'PORTRAIT' | 'NAME' | 'PHOTO';

export interface PortraitDotBuffers {
  count: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  homeX: Float32Array;
  homeY: Float32Array;
  portraitX: Float32Array;
  portraitY: Float32Array;
  portraitR: Float32Array;
  nameX: Float32Array;
  nameY: Float32Array;
  nameR: Float32Array;
  r: Float32Array;
  targetR: Float32Array;
  alpha: Float32Array;
  targetAlpha: Float32Array;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let photoImg: HTMLImageElement | null = null;
let modeBtn: HTMLButtonElement | null = null;

let W = 340;
let H = 320;
let currentState: PortraitState = 'PORTRAIT';
let INK = '#1b2340';

let buffers: PortraitDotBuffers | null = null;
let isLoaded = false;
let isReducedQuality = false;

// ── Color reader ───────────────────────────────────────────────────

export function readPortraitColors(): void {
  const s = getComputedStyle(document.documentElement);
  INK = s.getPropertyValue('--ink').trim() || '#1b2340';
  drawPortrait();
}

// ── Sampling Algorithms (Pure functions for testing & execution) ───

export function sampleImageToDots(
  imageData: ImageData,
  step: number,
  maxDots: number
): Array<{ x: number; y: number; r: number }> {
  const dots: Array<{ x: number; y: number; r: number }> = [];
  const { width, height, data } = imageData;

  for (let y = Math.floor(step / 2); y < height; y += step) {
    for (let x = Math.floor(step / 2); x < width; x += step) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3]!;
      if (alpha < 30) continue;

      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum > 0.92) continue; // skip near-white

      const dotR = (1 - lum) * step * 0.55;
      if (dotR < 0.6) continue;

      dots.push({ x, y, r: dotR });
      if (dots.length >= maxDots) return dots;
    }
  }

  return dots;
}

export function sampleNameToPoints(
  nameText: string,
  width: number,
  height: number,
  fontFamily = 'Hand, Fallback, cursive'
): Array<{ x: number; y: number; r: number }> {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = width;
  offCanvas.height = height;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return [];

  const fontSize = Math.min(48, Math.max(28, width / 7));
  offCtx.font = `${fontSize}px ${fontFamily}`;
  offCtx.textAlign = 'center';
  offCtx.textBaseline = 'middle';
  offCtx.fillStyle = INK;
  offCtx.fillText(nameText, width / 2, height / 2);

  const imgData = offCtx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const points: Array<{ x: number; y: number; r: number }> = [];
  const step = 4; // fine step for crisp letter coverage

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3]! > 40) {
        points.push({ x, y, r: 1.8 });
      }
    }
  }

  return points;
}

// ── Build Dot Buffers ──────────────────────────────────────────────

export function buildDotBuffers(
  portraitDots: Array<{ x: number; y: number; r: number }>,
  namePoints: Array<{ x: number; y: number; r: number }>
): PortraitDotBuffers {
  const count = portraitDots.length;
  const nameCount = namePoints.length;

  const buf: PortraitDotBuffers = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    homeX: new Float32Array(count),
    homeY: new Float32Array(count),
    portraitX: new Float32Array(count),
    portraitY: new Float32Array(count),
    portraitR: new Float32Array(count),
    nameX: new Float32Array(count),
    nameY: new Float32Array(count),
    nameR: new Float32Array(count),
    r: new Float32Array(count),
    targetR: new Float32Array(count),
    alpha: new Float32Array(count),
    targetAlpha: new Float32Array(count),
  };

  for (let i = 0; i < count; i++) {
    const p = portraitDots[i]!;
    buf.portraitX[i] = p.x;
    buf.portraitY[i] = p.y;
    buf.portraitR[i] = p.r;

    // Initial position in portrait state
    buf.x[i] = p.x;
    buf.y[i] = p.y;
    buf.homeX[i] = p.x;
    buf.homeY[i] = p.y;
    buf.r[i] = p.r;
    buf.targetR[i] = p.r;
    buf.alpha[i] = 1.0;
    buf.targetAlpha[i] = 1.0;

    // Name position mapping (reuse dots, excess fade out)
    if (nameCount > 0) {
      if (i < nameCount) {
        const n = namePoints[i]!;
        buf.nameX[i] = n.x;
        buf.nameY[i] = n.y;
        buf.nameR[i] = n.r;
      } else {
        // Extra dots fly to nearest modulo name point and fade to 0
        const n = namePoints[i % nameCount]!;
        buf.nameX[i] = n.x + (Math.random() - 0.5) * 6;
        buf.nameY[i] = n.y + (Math.random() - 0.5) * 6;
        buf.nameR[i] = 0;
      }
    } else {
      buf.nameX[i] = p.x;
      buf.nameY[i] = p.y;
      buf.nameR[i] = 0;
    }
  }

  return buf;
}

// ── State Switching ────────────────────────────────────────────────

export function setPortraitState(state: PortraitState): void {
  currentState = state;
  if (!buffers) return;

  const count = buffers.count;

  if (state === 'PORTRAIT') {
    photoImg?.classList.remove('visible');
    if (modeBtn) {
      modeBtn.textContent = 'who is this?';
      modeBtn.setAttribute('aria-pressed', 'false');
    }
    for (let i = 0; i < count; i++) {
      buffers.homeX[i] = buffers.portraitX[i]!;
      buffers.homeY[i] = buffers.portraitY[i]!;
      buffers.targetR[i] = buffers.portraitR[i]!;
      buffers.targetAlpha[i] = 1.0;
    }
  } else if (state === 'NAME') {
    photoImg?.classList.remove('visible');
    if (modeBtn) {
      modeBtn.textContent = 'show me';
      modeBtn.setAttribute('aria-pressed', 'true');
    }
    for (let i = 0; i < count; i++) {
      buffers.homeX[i] = buffers.nameX[i]!;
      buffers.homeY[i] = buffers.nameY[i]!;
      buffers.targetR[i] = buffers.nameR[i]!;
      buffers.targetAlpha[i] = buffers.nameR[i]! > 0 ? 1.0 : 0.0;
    }
  } else if (state === 'PHOTO') {
    photoImg?.classList.add('visible'); // crossfade over 600ms
    if (modeBtn) {
      modeBtn.textContent = 'dissolve';
      modeBtn.setAttribute('aria-pressed', 'true');
    }
    // Dots fade out under photo
    for (let i = 0; i < count; i++) {
      buffers.targetAlpha[i] = 0.0;
    }
  }
}

export function cyclePortraitState(): void {
  if (currentState === 'PORTRAIT') setPortraitState('NAME');
  else if (currentState === 'NAME') setPortraitState('PHOTO');
  else setPortraitState('PORTRAIT');
}

// ── Resampling ─────────────────────────────────────────────────────

let sourceImg: HTMLImageElement | null = null;

function resample(): void {
  if (!canvas || !sourceImg) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = Math.max(260, Math.round(rect.width || 340));
  H = Math.max(240, Math.round(rect.height || 320));

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const isCoarse = matchMedia('(pointer: coarse)').matches;
  const step = isCoarse ? 8 : 6;
  const maxDots = isCoarse
    ? (isReducedQuality ? 1250 : 2500)
    : (isReducedQuality ? 3000 : 6000);

  // Offscreen canvas with 1.5px blur
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const offCtx = off.getContext('2d');
  if (!offCtx) return;

  offCtx.filter = 'blur(1.5px)';
  offCtx.drawImage(sourceImg, 0, 0, W, H);
  offCtx.filter = 'none';

  const imgData = offCtx.getImageData(0, 0, W, H);
  const portraitDots = sampleImageToDots(imgData, step, maxDots);
  const namePoints = sampleNameToPoints('mahendra pratap', W, H);

  buffers = buildDotBuffers(portraitDots, namePoints);
  isLoaded = true;

  // Restore current state
  setPortraitState(currentState);
}

// ── Physics Stepping ───────────────────────────────────────────────

export function stepPortraitPhysics(
  pen: PenState,
  isTouch: boolean,
  tiltGx = 0,
  tiltGy = 0,
  tiltActive = false
): void {
  if (!buffers || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  // Document to canvas coordinate mapping
  const px = pen.x - rect.left;
  const py = pen.y - rect.top;

  const repelR = isTouch ? 140 : 110;
  const repelRSq = repelR * repelR;
  const count = buffers.count;
  const penActive = pen.seen && px >= -100 && px <= W + 100 && py >= -100 && py <= H + 100;
  const penSpeed = pen.sp;

  for (let i = 0; i < count; i++) {
    const hx = buffers.homeX[i]!;
    const hy = buffers.homeY[i]!;
    let x = buffers.x[i]!;
    let y = buffers.y[i]!;
    let vx = buffers.vx[i]!;
    let vy = buffers.vy[i]!;

    // Spring to home (0.06) & Damping (0.85)
    vx = (vx + (hx - x) * 0.06) * 0.85;
    vy = (vy + (hy - y) * 0.06) * 0.85;

    // Repel from pointer
    if (penActive) {
      const dx = x - px;
      const dy = y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq < repelRSq) {
        const d = Math.sqrt(dSq) || 1;
        const force = ((1 - d / repelR) ** 2) * (penSpeed * 0.1 + 1.2);
        vx += (dx / d) * force;
        vy += (dy / d) * force;
      }
    }

    // Tilt gravity mode
    if (tiltActive) {
      vx += tiltGx * 0.35;
      vy += tiltGy * 0.35;
    }

    // Idle shimmer: up to 0.15px jitter for resting dots
    if (currentState !== 'PHOTO' && Math.abs(vx) + Math.abs(vy) < 0.1) {
      x += (Math.random() - 0.5) * 0.3;
      y += (Math.random() - 0.5) * 0.3;
    }

    x += vx;
    y += vy;

    buffers.x[i] = x;
    buffers.y[i] = y;
    buffers.vx[i] = vx;
    buffers.vy[i] = vy;

    // Smooth radius and alpha transitions
    buffers.r[i] += (buffers.targetR[i]! - buffers.r[i]!) * 0.12;
    buffers.alpha[i] += (buffers.targetAlpha[i]! - buffers.alpha[i]!) * 0.12;
  }
}

// ── Shockwave Impulse ──────────────────────────────────────────────

export function shockwavePortrait(cx: number, cy: number, strength = 6, falloff = 220): void {
  if (!buffers) return;
  const count = buffers.count;
  const falloffSq = falloff * falloff;

  for (let i = 0; i < count; i++) {
    const x = buffers.x[i]!;
    const y = buffers.y[i]!;
    const dx = x - cx;
    const dy = y - cy;
    const dSq = dx * dx + dy * dy;

    if (dSq < falloffSq) {
      const d = Math.sqrt(dSq) || 1;
      const force = (1 - d / falloff) * strength;
      buffers.vx[i] += (dx / d) * force;
      buffers.vy[i] += (dy / d) * force;
    }
  }
}

// ── Drawing ────────────────────────────────────────────────────────

export function drawPortrait(): void {
  if (!ctx || !buffers || !canvas) return;

  ctx.clearRect(0, 0, W, H);
  if (currentState === 'PHOTO' && buffers.alpha[0]! < 0.02) return;

  ctx.fillStyle = INK;
  ctx.beginPath();

  const count = buffers.count;
  for (let i = 0; i < count; i++) {
    const a = buffers.alpha[i]!;
    const r = buffers.r[i]!;
    if (a < 0.05 || r < 0.2) continue;

    const x = buffers.x[i]!;
    const y = buffers.y[i]!;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  ctx.fill();
}

// ── Adaptive Quality Reduction ─────────────────────────────────────

export function reducePortraitQuality(): void {
  isReducedQuality = true;
  resample();
}

// ── Initialization ─────────────────────────────────────────────────

export function initPortrait(): void {
  canvas = document.getElementById('portrait-canvas') as HTMLCanvasElement | null;
  photoImg = document.getElementById('portrait-photo') as HTMLImageElement | null;
  modeBtn = document.getElementById('btn-portrait-mode') as HTMLButtonElement | null;

  if (!canvas || !photoImg) return;

  readPortraitColors();
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', readPortraitColors);

  // Toggle button handler
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      cyclePortraitState();
    });
    modeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cyclePortraitState();
      }
    });
  }

  // Portrait canvas shockwave on click/tap
  canvas.addEventListener('pointerdown', (e) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    shockwavePortrait(cx, cy, 6, 220);
  }, { passive: true });

  // Load image asynchronously to preserve fast LCP
  const img = new Image();
  img.decoding = 'async';
  img.src = '/images/head-bw-cutout.png';
  const onReady = () => {
    sourceImg = img;
    if (photoImg) photoImg.src = img.src;
    document.fonts.ready.then(resample);
  };
  if (img.complete) {
    onReady();
  } else {
    img.addEventListener('load', onReady);
  }

  // Debounced resample on width resize only
  let lastW = innerWidth;
  let resampleTimer: number | null = null;
  window.addEventListener('resize', () => {
    if (innerWidth !== lastW) {
      lastW = innerWidth;
      if (resampleTimer) clearTimeout(resampleTimer);
      resampleTimer = window.setTimeout(resample, 200);
    }
  }, { passive: true });
}

export { buffers, currentState, isLoaded };
