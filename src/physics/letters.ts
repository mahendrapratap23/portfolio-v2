/**
 * letters.ts — Letter DOM management, measurement, and per-frame stepping.
 *
 * Responsibilities:
 *  - Walk `.phys` elements and split into letter bodies
 *  - Measure rest positions (debounced on resize / font load / layout change)
 *  - Per-frame: step each body, update CSS transform, toggle .near class
 *  - Skip bodies > 400px off-screen
 *  - Clear transform + stop updating when at rest (non-gravity mode)
 */

import {
  type LetterBody,
  type PenState,
  springStep,
  rotStep,
  gravityStep,
  repelStep,
  isAtRest,
  NEAR_THRESHOLD,
  GRAVITY,
  shockwaveStep,
} from './physics.js';

// ── Letter DOM splitting ───────────────────────────────────────────

/** All tracked letter bodies across every .phys element. */
export const letters: LetterBody[] = [];

/**
 * Split all `.phys` elements into per-letter span bodies.
 * The hero section letters start with a random scatter offset (like the template).
 * Must be called once after DOM is ready.
 */
export function initLetters(): void {
  document.querySelectorAll<HTMLElement>('.phys').forEach((root) => {
    const isHero = !!root.closest('.hero');
    const sec = root.closest('section')!;
    splitElement(root, isHero, sec);
  });
}

function splitElement(
  root: HTMLElement,
  isHero: boolean,
  sec: Element
): void {
  // Walk text nodes, wrap each word then each character
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    const frag = document.createDocumentFragment();
    const parts = node.data.split(/(\s+)/);
    for (const part of parts) {
      if (!part.trim()) {
        frag.append(part);
        continue;
      }
      // Word wrapper
      const wordSpan = document.createElement('span');
      wordSpan.className = 'w';

      // Individual letter spans
      for (const ch of [...part]) {
        const letterSpan = document.createElement('span');
        letterSpan.className = 'l';
        letterSpan.textContent = ch;

        const body: LetterBody = {
          e: letterSpan,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          r: 0,
          vr: 0,
          cx: 0,
          cy: 0,
          fl: 0,
          sec,
          on: 0,
          nr: 0,
        };

        // Hero letters scatter from above (like template)
        if (isHero) {
          body.x = (Math.random() - 0.5) * 80;
          body.y = -150 - Math.random() * 250;
          body.r = (Math.random() - 0.5) * 2;
          letterSpan.style.transform = `translate(${body.x}px,${body.y}px) rotate(${body.r}rad)`;
        }

        letters.push(body);
        wordSpan.append(letterSpan);
      }
      frag.append(wordSpan);
    }
    node.replaceWith(frag);
  }
}

// ── Rest position measurement ──────────────────────────────────────

/**
 * Measure and store the rest positions of every letter.
 * Called after fonts load, on resize, and after layout changes.
 * Reads all getBoundingClientRect in one pass (no interleaved writes).
 */
export function measureLetters(): void {
  // BATCH ALL READS before any writes
  const measurements: Array<{
    body: LetterBody;
    cx: number;
    cy: number;
    fl: number;
  }> = [];

  for (const body of letters) {
    const b = body.e.getBoundingClientRect();
    const s = body.sec.getBoundingClientRect();
    const cx = b.left + b.width / 2 + scrollX - body.x;
    const cy = b.top + b.height / 2 + scrollY - body.y;
    const fl = s.bottom - (b.bottom - body.y) - 8;
    measurements.push({ body, cx, cy, fl });
  }

  // THEN write (no layout thrash)
  for (const { body, cx, cy, fl } of measurements) {
    body.cx = cx;
    body.cy = cy;
    body.fl = fl;
  }
}

// ── Per-frame step ─────────────────────────────────────────────────

/**
 * Advance all letters by one fixed timestep.
 * @param pen  current pen state (document coords = pen.x + scrollX)
 * @param gravity whether gravity mode is active
 * @param gx optional directional gravity x from device tilt
 * @param gy optional directional gravity y from device tilt
 */
export function stepLetters(
  pen: PenState,
  gravity: boolean,
  gx = 0,
  gy = GRAVITY,
  sheetSampleFn?: (vx: number, vy: number) => number,
  sheetAwake = false
): void {
  const px = pen.x + scrollX;
  const py = pen.y + scrollY;
  const top = scrollY - 400;
  const bot = scrollY + innerHeight + 400;

  for (const body of letters) {
    const wy = body.cy + body.y;

    // Skip letters far off-screen
    if (wy < top || wy > bot) continue;

    const repelled = pen.seen && repelStep(body, px, py, pen.sp);

    // Sample sheet wave height at letter's rest position (viewport coords)
    const lvx = body.cx - scrollX;
    const lvy = body.cy - scrollY;
    const inVp = lvx >= -20 && lvx <= innerWidth + 20 && lvy >= -20 && lvy <= innerHeight + 20;
    const waveH = sheetAwake && sheetSampleFn && inVp ? sheetSampleFn(lvx, lvy) : 0;

    if (!repelled && !gravity && isAtRest(body) && Math.abs(waveH) < 0.01) {
      if (body.nr || body.on) {
        body.e.style.transform = '';
        body.e.classList.remove('near');
        body.nr = 0;
        body.on = 0;
        body.prevX = undefined;
        body.prevY = undefined;
        body.prevR = undefined;
      }
      continue;
    }

    // Step physics
    if (gravity) {
      gravityStep(body, gx, gy);
    } else {
      springStep(body);
      rotStep(body);
    }

    // Near outline
    const displaced =
      Math.abs(body.x) + Math.abs(body.y) > NEAR_THRESHOLD ? 1 : 0;
    if (displaced !== body.nr) {
      body.nr = displaced;
      body.e.classList.toggle('near', !!displaced);
    }

    body.on = 1;

    // Phase 3: Letters ride waves (h * 8px displacement, h * 0.02 rad rotation)
    const renderY = body.y + waveH * 8;
    const renderR = body.r + waveH * 0.02;

    // Write transforms ONLY when values actually moved
    const dx = Math.abs(body.x - (body.prevX ?? -9999));
    const dy = Math.abs(renderY - (body.prevY ?? -9999));
    const dr = Math.abs(renderR - (body.prevR ?? -9999));

    if (dx > 0.05 || dy > 0.05 || dr > 0.002) {
      body.prevX = body.x;
      body.prevY = renderY;
      body.prevR = renderR;
      body.e.style.transform = `translate(${body.x.toFixed(1)}px,${renderY.toFixed(1)}px) rotate(${renderR.toFixed(3)}rad)`;
    }
  }
}

/**
 * Apply radial shockwave impulse from a tap/click to nearby letters.
 */
export function shockwaveLetters(
  sx: number,
  sy: number,
  strength = 6,
  falloff = 220
): void {
  for (const body of letters) {
    shockwaveStep(body, sx, sy, strength, falloff);
  }
}

/**
 * Called when gravity mode turns ON — give letters an initial kick.
 */
export function kickLetters(): void {
  for (const body of letters) {
    body.vy -= Math.random() * 5;
    body.vr += (Math.random() - 0.5) * 0.15;
  }
}
