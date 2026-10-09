import { describe, it, expect, beforeEach } from 'vitest';
import {
  ENABLE_CLICK_BLOT,
  spawnBlot,
  blots,
  segs,
  stepInk,
  drawInk,
} from './ink';
import { type PenState } from './physics';

describe('Part 1: Pen and Ink Touch Polish & Blot Removal', () => {
  beforeEach(() => {
    blots.length = 0;
    segs.length = 0;
  });

  it('verifies ENABLE_CLICK_BLOT is false and spawnBlot creates no blots', () => {
    expect(ENABLE_CLICK_BLOT).toBe(false);
    spawnBlot(100, 100, 1000, 800, 600);
    expect(blots.length).toBe(0);
  });

  it('on touch: ignores vertical scroll and does NOT add ink segments', () => {
    const pen: PenState = {
      x: 100,
      y: 150,
      ox: 100,
      oy: 100,
      tx: 100,
      ty: 150,
      vx: 0,
      vy: 5,
      sp: 5,
      w: 3,
      idle: 0,
      bead: 0,
      seen: true,
      isTouch: true,
      isDown: true,
      touchStrokeActive: false, // Vertical scroll: horizontal threshold not passed
    };

    stepInk(pen, 1000, 800);
    expect(segs.length).toBe(0);
  });

  it('on touch: adds ink segments with isTouch=true when horizontal drawing is active', () => {
    const pen: PenState = {
      x: 150,
      y: 105,
      ox: 100,
      oy: 100,
      tx: 150,
      ty: 105,
      vx: 5,
      vy: 0.5,
      sp: 5,
      w: 3,
      idle: 0,
      bead: 0,
      seen: true,
      isTouch: true,
      isDown: true,
      touchStrokeActive: true, // Horizontal stroke unlocked
    };

    stepInk(pen, 1000, 800);
    expect(segs.length).toBe(1);
    expect(segs[0].isTouch).toBe(true);
  });

  it('fades touch segments in 2000 ms vs mouse segments in 5000 ms', () => {
    // Add one touch segment at t = 1000
    segs.push({ a: 0, b: 0, c: 10, d: 10, w: 2, t: 1000, isTouch: true });
    // Add one mouse segment at t = 1000
    segs.push({ a: 20, b: 20, c: 30, d: 30, w: 2, t: 1000, isTouch: false });

    const mockCtx = {
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
      fillStyle: '',
      globalAlpha: 1,
      lineWidth: 1,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      closePath: () => {},
      arc: () => {},
    } as unknown as CanvasRenderingContext2D;

    const dummyPen: PenState = {
      x: 0, y: 0, ox: 0, oy: 0, tx: 0, ty: 0,
      vx: 0, vy: 0, sp: 0, w: 2, idle: 0, bead: 0,
      seen: false, isTouch: false,
    };

    // At t = 3500 (2500ms later):
    // Touch segment (age 2500 > 2000) must expire!
    // Mouse segment (age 2500 <= 5000) must remain!
    drawInk(mockCtx, '#000', '#fff', dummyPen, 3500);

    expect(segs.length).toBe(1);
    expect(segs[0].isTouch).toBe(false);

    // At t = 6500 (5500ms later):
    // Mouse segment also expires
    drawInk(mockCtx, '#000', '#fff', dummyPen, 6500);
    expect(segs.length).toBe(0);
  });

  it('on touch: pen graphic fades out in 150 ms and stops drawing when finger lifts', () => {
    const pen: PenState = {
      x: 100, y: 100, ox: 100, oy: 100, tx: 100, ty: 100,
      vx: 0, vy: 0, sp: 0, w: 2, idle: 0, bead: 0,
      seen: true, isTouch: true, isDown: false,
      touchFadeStartTime: 1000,
    };

    let drawnAlpha = 0;
    const mockCtx = {
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
      fillStyle: '',
      globalAlpha: 1,
      lineWidth: 1,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      closePath: () => {},
      arc: () => {},
    } as unknown as CanvasRenderingContext2D;

    Object.defineProperty(mockCtx, 'globalAlpha', {
      set: (val: number) => { drawnAlpha = val; },
      get: () => drawnAlpha,
    });

    // 75ms into fade: alpha should be ~0.5
    drawInk(mockCtx, '#000', '#fff', pen, 1075);
    expect(drawnAlpha).toBeCloseTo(0.5, 1);

    // 160ms into fade (> 150ms): pen is stopped / not drawn
    drawnAlpha = -1;
    drawInk(mockCtx, '#000', '#fff', pen, 1160);
    // drawnAlpha should not be set to a positive alpha for pen
    expect(pen.touchFadeStartTime).toBe(0);
  });
});
