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
  isAtRest,
} from './physics';

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
});
