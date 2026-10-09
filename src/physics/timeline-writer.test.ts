import { describe, it, expect } from 'vitest';
import {
  calculateScrollProgress,
  generateWobblyLine,
  MAX_STAGGER_DELAY_MS,
  PRESS_HOLD_MS,
  MAX_BLOTS_PER_TAP,
} from './timeline-writer';

describe('TimelineWriter Logic & Constants', () => {
  it('enforces spec constants', () => {
    expect(MAX_STAGGER_DELAY_MS).toBeLessThanOrEqual(800);
    expect(PRESS_HOLD_MS).toBe(400);
    expect(MAX_BLOTS_PER_TAP).toBeLessThanOrEqual(3);
  });

  it('calculates scroll progress correctly', () => {
    const vh = 800;
    const height = 1000;

    // Above viewport: sectionTop way below viewport
    const progressAbove = calculateScrollProgress(1200, height, vh);
    expect(progressAbove).toBe(0);

    // Section in view
    const progressMid = calculateScrollProgress(200, height, vh);
    expect(progressMid).toBeGreaterThan(0);
    expect(progressMid).toBeLessThan(1);

    // Section scrolled past
    const progressPast = calculateScrollProgress(-1200, height, vh);
    expect(progressPast).toBe(1);
  });

  it('generates a valid SVG path with subtle wobble', () => {
    const d = generateWobblyLine(600);
    expect(d).toMatch(/^M 12/);
    expect(d).toContain('Q');
    expect(d).toContain('L');
  });
});
