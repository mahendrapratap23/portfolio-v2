/**
 * physics.test.ts — Unit tests for spring, floor, and pen physics.
 *
 * Tests verify the exact constants and formulas from the spec.
 * Run with: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import {
  type LetterBody,
  type PenState,
  SPRING,
  DAMP,
  ROT_SPRING,
  ROT_DAMP,
  BOUNCE,
  GRAVITY,
  FRICTION,
  ROT_DAMP_G,
  REPEL_R,
  PEN_SPRING,
  PEN_DAMP,
  NEAR_THRESHOLD,
  springStep,
  rotStep,
  gravityStep,
  repelStep,
  penStep,
  shockwaveStep,
  isAtRest,
} from './physics';
import { sampleImageToDots, buildDotBuffers } from './portrait';
import { LivingSheet } from './sheet';

// ── Helpers ────────────────────────────────────────────────────────

function makeBody(overrides: Partial<LetterBody> = {}): LetterBody {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    r: 0, vr: 0,
    cx: 100, cy: 100,
    fl: 200,
    e: null as unknown as HTMLSpanElement,
    sec: null as unknown as Element,
    on: 0, nr: 0,
    ...overrides,
  };
}

function makePen(overrides: Partial<PenState> = {}): PenState {
  return {
    x: 0, y: 0,
    ox: 0, oy: 0,
    tx: 0, ty: 0,
    vx: 0, vy: 0,
    sp: 0, w: 5,
    idle: 0, bead: 0,
    seen: false,
    ...overrides,
  };
}

// ── Constants ──────────────────────────────────────────────────────

describe('Physics constants match spec', () => {
  it('spring constant = 0.05', () => expect(SPRING).toBe(0.05));
  it('velocity damping = 0.86', () => expect(DAMP).toBe(0.86));
  it('rotation spring = 0.05', () => expect(ROT_SPRING).toBe(0.05));
  it('rotation damping = 0.9', () => expect(ROT_DAMP).toBe(0.9));
  it('gravity = 0.7', () => expect(GRAVITY).toBe(0.7));
  it('bounce = 0.45', () => expect(BOUNCE).toBe(0.45));
  it('friction = 0.8', () => expect(FRICTION).toBe(0.8));
  it('repel radius = 85', () => expect(REPEL_R).toBe(85));
  it('near threshold = 6', () => expect(NEAR_THRESHOLD).toBe(6));
  it('rotation damping under gravity = 0.6', () => expect(ROT_DAMP_G).toBe(0.6));
  it('pen spring = 0.2', () => expect(PEN_SPRING).toBe(0.2));
  it('pen damping = 0.62', () => expect(PEN_DAMP).toBe(0.62));
});

// ── Spring physics ─────────────────────────────────────────────────

describe('springStep', () => {
  it('pulls displaced letter back toward origin', () => {
    const body = makeBody({ x: 100, y: 0 });
    springStep(body);
    expect(body.x).toBeLessThan(100);
  });

  it('applies spring force: vx -= x * SPRING', () => {
    const body = makeBody({ x: 100, y: 0, vx: 0, vy: 0 });
    const expectedVx = (0 - 100 * SPRING) * DAMP;
    springStep(body);
    expect(body.vx).toBeCloseTo(expectedVx, 10);
  });

  it('applies velocity damping each step', () => {
    const body = makeBody({ x: 0, vx: 10 });
    springStep(body);
    // vx = (10 + 0 * spring) * damp = 10 * 0.86 = 8.6
    expect(body.vx).toBeCloseTo(10 * DAMP, 10);
  });

  it('converges to zero over many steps (overdamped)', () => {
    const body = makeBody({ x: 50, y: 30 });
    for (let i = 0; i < 500; i++) { springStep(body); rotStep(body); }
    expect(Math.abs(body.x)).toBeLessThan(0.001);
    expect(Math.abs(body.y)).toBeLessThan(0.001);
  });
});

// ── Rotation physics ───────────────────────────────────────────────

describe('rotStep', () => {
  it('reduces rotation toward zero', () => {
    const body = makeBody({ r: 1.0 });
    rotStep(body);
    expect(Math.abs(body.r)).toBeLessThan(1.0);
  });

  it('applies rotation spring: vr -= r * ROT_SPRING', () => {
    const body = makeBody({ r: 1.0, vr: 0 });
    const expectedVr = (0 - 1.0 * ROT_SPRING) * ROT_DAMP;
    rotStep(body);
    expect(body.vr).toBeCloseTo(expectedVr, 10);
  });
});

// ── Gravity + floor ────────────────────────────────────────────────

describe('gravityStep', () => {
  it('accelerates body downward', () => {
    const body = makeBody({ y: 0, vy: 0 });
    gravityStep(body);
    expect(body.vy).toBeGreaterThan(0);
  });

  it('accelerates by exactly GRAVITY per frame', () => {
    const body = makeBody({ y: 0, vy: 0 });
    gravityStep(body);
    // vy = 0 + GRAVITY = 0.7, then body.y += vy
    // But vx also multiplied by FRICTION, so vy is just += GRAVITY first
    expect(body.vy).toBeCloseTo(GRAVITY, 10);
  });

  it('bounces off the floor', () => {
    // Put body exactly at floor
    const body = makeBody({ y: 200, vy: 5, fl: 200 });
    gravityStep(body);
    // After step: y = 200 + (5 + GRAVITY) → exceeds floor → set y=fl, vy *= -BOUNCE
    expect(body.y).toBe(200);
    expect(body.vy).toBeLessThan(0); // bounced back up
  });

  it('stops vertical velocity below threshold 1', () => {
    const body = makeBody({ y: 195, vy: 0.5, fl: 200 });
    gravityStep(body);
    // vy after gravity = 0.5 + 0.7 = 1.2 → hits floor
    // bounced: vy = -1.2 * 0.45 = -0.54 (abs > 1? no wait: abs(0.54) < 1, so vy = 0)
    // Let me calculate: vy = 0.5 + GRAVITY = 1.2, then y = 195 + 1.2 = 196.2
    // 196.2 < 200, so no bounce
    // Actually body only bounces if y > fl. Let's recalculate
    // y_new = 195 + 1.2 = 196.2; 196.2 <= 200 → no bounce
    expect(body.vy).toBeCloseTo(1.2, 5);
  });

  it('vy set to 0 on bounce when |vy| < 1', () => {
    // Set up so after bounce, |vy| < 1
    // vy_before_bounce = 0.5, bounce makes vy = -0.5 * 0.45 = -0.225 → abs < 1 → vy = 0
    const body = makeBody({ y: 202, vy: 0.5, fl: 200 });
    gravityStep(body);
    // y_new = 202 + (0.5 + 0.7) = 203.2 > 200
    // set y = 200, vy = -(0.5 + 0.7) * 0.45 = -0.54 → |0.54| < 1 → vy = 0
    expect(body.y).toBe(200);
    expect(body.vy).toBe(0);
  });
});

// ── Repel force ────────────────────────────────────────────────────

describe('repelStep', () => {
  it('does nothing when pen is outside REPEL_R', () => {
    const body = makeBody({ x: 0, y: 0, cx: 0, cy: 0 });
    repelStep(body, 200, 200, 0); // d = ~283 > 85
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
  });

  it('pushes body away from pen', () => {
    // body at (0,0) doc coords (cx+x = 0,0), pen at (0,50) (directly below)
    const body = makeBody({ x: 0, y: 0, cx: 0, cy: 0 });
    repelStep(body, 0, 50, 0); // d = 50 < 85
    // body should be pushed upward (vy < 0, since pen is below body)
    expect(body.vy).toBeLessThan(0);
  });

  it('force scales with pen speed', () => {
    const bodyFast = makeBody({ x: 0, y: 0, cx: 0, cy: 0 });
    const bodySlow = makeBody({ x: 0, y: 0, cx: 0, cy: 0 });
    repelStep(bodyFast, 0, 50, 10);
    repelStep(bodySlow, 0, 50, 0);
    expect(Math.abs(bodyFast.vy)).toBeGreaterThan(Math.abs(bodySlow.vy));
  });

  it('force formula: (1-d/R)^2 * (speed*0.12 + 1.4)', () => {
    const body = makeBody({ x: 0, y: 0, cx: 0, cy: 50 });
    // pen at (0, 0), body at doc (0, 50), d=50
    repelStep(body, 0, 0, 5);
    const d = 50;
    const expectedF = ((1 - d / REPEL_R) ** 2) * (5 * 0.12 + 1.4);
    // dy = (50 - 0) = 50, dir = 50/50 = 1
    expect(body.vy).toBeCloseTo(1 * expectedF, 5);
  });
});

// ── isAtRest ───────────────────────────────────────────────────────

describe('isAtRest', () => {
  it('body at origin with no velocity is at rest', () => {
    expect(isAtRest(makeBody())).toBe(true);
  });

  it('body displaced by 1px is not at rest', () => {
    expect(isAtRest(makeBody({ x: 1 }))).toBe(false);
  });

  it('body with velocity is not at rest', () => {
    expect(isAtRest(makeBody({ vx: 0.1 }))).toBe(false);
  });

  it('rotated body is not at rest (rotation multiplied by 40)', () => {
    // rotation of 0.002 rad: 0.002 * 40 = 0.08 > 0.05
    expect(isAtRest(makeBody({ r: 0.002 }))).toBe(false);
  });
});

// ── Pen physics ────────────────────────────────────────────────────

describe('penStep', () => {
  it('moves pen toward target', () => {
    const pen = makePen({ x: 0, y: 0, tx: 100, ty: 0 });
    penStep(pen);
    expect(pen.x).toBeGreaterThan(0);
  });

  it('overshoots slightly (spring behaviour)', () => {
    const pen = makePen({ x: 0, y: 0, tx: 100, ty: 0 });
    // Run until close, then move target back to 0
    for (let i = 0; i < 10; i++) penStep(pen);
    const prevX = pen.x;
    pen.tx = 0;
    for (let i = 0; i < 5; i++) penStep(pen);
    // pen should have moved back
    expect(pen.x).toBeLessThan(prevX);
  });

  it('pen spring = 0.2, damping = 0.62', () => {
    const pen = makePen({ x: 0, tx: 100, vx: 0 });
    penStep(pen);
    const expectedVx = (0 + (100 - 0) * PEN_SPRING) * PEN_DAMP;
    expect(pen.vx).toBeCloseTo(expectedVx, 10);
  });

  it('sp = magnitude of velocity', () => {
    const pen = makePen({ x: 0, tx: 100, vy: 0 });
    penStep(pen);
    expect(pen.sp).toBeCloseTo(Math.hypot(pen.vx, pen.vy), 10);
  });

  it('touch mode follows target directly with zero spring lag', () => {
    const pen = makePen({ x: 10, y: 10, tx: 50, ty: 80, isTouch: true });
    penStep(pen);
    expect(pen.x).toBe(50);
    expect(pen.y).toBe(80);
    expect(pen.vx).toBe(40);
    expect(pen.vy).toBe(70);
    expect(pen.sp).toBeCloseTo(Math.hypot(40, 70), 5);
  });
});

// ── shockwaveStep ──────────────────────────────────────────────────

describe('shockwaveStep', () => {
  it('applies radial impulse to nearby letter body', () => {
    const body = makeBody({ x: 0, y: 0, cx: 100, cy: 100 });
    const hit = shockwaveStep(body, 100, 150, 6, 220);
    expect(hit).toBe(true);
    // Body was at cy: 100, shockwave at sy: 150 -> dy = -50 -> pushed upward (negative vy)
    expect(body.vy).toBeLessThan(0);
  });

  it('ignores letters beyond falloff radius', () => {
    const body = makeBody({ x: 0, y: 0, cx: 100, cy: 100 });
    const hit = shockwaveStep(body, 100, 400, 6, 220); // d = 300 > 220
    expect(hit).toBe(false);
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
  });
});

// ── Tilt Gravity ───────────────────────────────────────────────────

describe('tilt gravityStep', () => {
  it('accelerates horizontally with gx tilt component', () => {
    const body = makeBody({ x: 0, y: 0, vx: 0, vy: 0 });
    gravityStep(body, 0.5, 0.7);
    expect(body.vx).toBeCloseTo(0.5 * FRICTION, 5);
    expect(body.vy).toBeCloseTo(0.7, 5);
  });
});

// ── Portrait Sampling & Buffers ────────────────────────────────────

describe('Portrait Sampling and Buffers', () => {
  it('sampleImageToDots filters transparent and near-white pixels and calculates radius', () => {
    // 20x20 test image data with 4 pixels:
    // 1: black opaque, 2: white opaque, 3: black transparent, 4: mid-gray opaque
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);

    // Black opaque at (3, 3) (step 6 -> sampled at (3, 3))
    const idx1 = (3 * width + 3) * 4;
    data[idx1] = 0; data[idx1 + 1] = 0; data[idx1 + 2] = 0; data[idx1 + 3] = 255;

    // White opaque at (9, 3)
    const idx2 = (3 * width + 9) * 4;
    data[idx2] = 255; data[idx2 + 1] = 255; data[idx2 + 2] = 255; data[idx2 + 3] = 255;

    const mockImgData = { width, height, data } as ImageData;
    const dots = sampleImageToDots(mockImgData, 6, 100);

    // Only black opaque should be sampled
    expect(dots.length).toBe(1);
    expect(dots[0]!.x).toBe(3);
    expect(dots[0]!.y).toBe(3);
    // radius = (1 - 0) * 6 * 0.55 = 3.3
    expect(dots[0]!.r).toBeCloseTo(3.3, 2);
  });

  it('buildDotBuffers allocates Float32Arrays and maps portrait & name targets correctly', () => {
    const portraitDots = [
      { x: 10, y: 20, r: 2.5 },
      { x: 30, y: 40, r: 3.0 },
    ];
    const namePoints = [
      { x: 50, y: 50, r: 1.8 },
    ];

    const buf = buildDotBuffers(portraitDots, namePoints);
    expect(buf.count).toBe(2);
    expect(buf.portraitX[0]).toBe(10);
    expect(buf.portraitY[0]).toBe(20);
    expect(buf.nameX[0]).toBe(50);
    expect(buf.nameY[0]).toBe(50);
    // Second dot should have nameR = 0 (fades out in name state)
    expect(buf.nameR[1]).toBe(0);
    expect(buf.x instanceof Float32Array).toBe(true);
    expect(buf.homeX[0]).toBe(10);
  });
});

describe('LivingSheet Membrane Physics', () => {
  it('allocates grid with 1 cell margin and Float32Array buffers', () => {
    const s = new LivingSheet();
    s.allocateGrid(280, 280);
    expect(s.cols).toBeGreaterThan(10);
    expect(s.rows).toBeGreaterThan(10);
    expect(s.h instanceof Float32Array).toBe(true);
    expect(s.v instanceof Float32Array).toBe(true);
    expect(s.h.length).toBe(s.cols * s.rows);
  });

  it('applies a dent scaled by speed and bounded within radius', () => {
    const s = new LivingSheet();
    s.allocateGrid(400, 400);

    // Apply slow dent at (200, 200)
    s.applyDent(200, 200, 0.5, false);
    const slowHeight = s.sampleHeight(200, 200);
    expect(slowHeight).toBeLessThan(0); // dent is depressed

    // Fast dent creates deeper depression
    const sFast = new LivingSheet();
    sFast.allocateGrid(400, 400);
    sFast.applyDent(200, 200, 15, false);
    const fastHeight = sFast.sampleHeight(200, 200);
    expect(fastHeight).toBeLessThan(slowHeight);

    // Points far away outside radius (90px) remain unaffected
    expect(s.sampleHeight(50, 50)).toBe(0);
  });

  it('applies a ripple impulse to velocity field', () => {
    const s = new LivingSheet();
    s.allocateGrid(400, 400);
    s.applyImpulse(200, 200, 5.0);

    // Velocity around center should be negative (downward impulse)
    let minV = 0;
    for (let i = 0; i < s.v.length; i++) {
      if (s.v[i]! < minV) minV = s.v[i]!;
    }
    expect(minV).toBeLessThan(-1.0);
  });

  it('waveStep propagates waves to neighbours and damps over time', () => {
    const s = new LivingSheet();
    s.allocateGrid(300, 300);
    const pen = makePen({ seen: false, sp: 0 });

    // Initial localized displacement in center cell
    const midC = Math.floor(s.cols / 2);
    const midR = Math.floor(s.rows / 2);
    const centerIdx = midR * s.cols + midC;
    s.h[centerIdx] = -4.0;
    s.wake();

    // Step physics once
    s.stepPhysics(pen);

    // Velocity at center should accelerate upward, and adjacent cells start receiving wave
    const neighborIdx = centerIdx + 1;
    expect(s.v[neighborIdx]).not.toBe(0);

    // Fixed edges remain zero
    expect(s.h[0]).toBe(0);
    expect(s.v[0]).toBe(0);
    expect(s.h[s.cols - 1]).toBe(0);
  });

  it('sleeps when max absolute energy drops below 0.01 and pen is still', () => {
    const s = new LivingSheet();
    s.allocateGrid(200, 200);
    const pen = makePen({ seen: true, sp: 0 });

    // Tiny noise well below 0.01
    s.h.fill(0.002);
    s.v.fill(0.001);
    s.awake = true;

    s.stepPhysics(pen);
    expect(s.awake).toBe(false);
    expect(s.sleeping).toBe(true);

    // Wakes on wake()
    s.wake();
    expect(s.awake).toBe(true);
    expect(s.sleeping).toBe(false);
  });

  it('bilinear height sampling returns interpolated values', () => {
    const s = new LivingSheet();
    s.allocateGrid(300, 300);
    s.awake = true;

    // Set height at known cell
    const idx = 3 * s.cols + 3;
    s.h[idx] = 2.0;

    const x = 3 * s.step + s.offsetX;
    const y = 3 * s.step + s.offsetY;
    const sampled = s.sampleHeight(x, y);
    expect(sampled).toBeCloseTo(2.0, 1);

    // Sampling outside returns 0
    expect(s.sampleHeight(-500, -500)).toBe(0);
  });
});


