import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillsEcosystem,
  SKILL_NAMES,
  DRAG_STIFFNESS,
  DRAG_DAMPING,
  LINK_LIFETIME_MS,
  MAX_SIMULTANEOUS_LINKS,
  HIT_RADIUS,
} from './skills-ecosystem';

describe('SkillsEcosystem Physics & Logic', () => {
  let eco: SkillsEcosystem;

  beforeEach(() => {
    eco = new SkillsEcosystem();
    eco.width = 600;
    eco.height = 400;
    // Space out creatures far apart by default so pairwise tests are isolated
    for (let i = 0; i < eco.creatures.length; i++) {
      eco.creatures[i].x = 2000 + i * 500;
      eco.creatures[i].y = 2000 + i * 500;
    }
  });

  it('initializes all 9 skills with valid starting parameters', () => {
    expect(eco.creatures).toHaveLength(9);
    const names = eco.creatures.map((c) => c.name);
    expect(names).toEqual(SKILL_NAMES);
    for (const c of eco.creatures) {
      expect(c.r).toBeGreaterThan(0);
      expect(c.isDragged).toBe(false);
    }
  });

  it('hit radius meets the 44px touch target minimum', () => {
    expect(HIT_RADIUS * 2).toBeGreaterThanOrEqual(44);
  });

  it('spring drag calculates force with stiffness 0.12 and damping 0.8', () => {
    const c = eco.creatures[0];
    c.x = 100;
    c.y = 100;
    c.vx = 0;
    c.vy = 0;
    c.isDragged = true;
    c.dragTargetX = 150;
    c.dragTargetY = 100;

    eco.stepPhysics();

    const expectedFx = (150 - 100) * DRAG_STIFFNESS; // 50 * 0.12 = 6
    const expectedVx = (0 + expectedFx) * DRAG_DAMPING; // 6 * 0.8 = 4.8
    expect(c.vx).toBeCloseTo(expectedVx, 2);
    expect(c.x).toBeCloseTo(100 + expectedVx, 2);
  });

  it('momentum is retained upon drag release', () => {
    const c = eco.creatures[0];
    c.x = 100;
    c.y = 100;
    c.vx = 8.5;
    c.vy = 4.2;
    c.isDragged = false; // released

    eco.stepPhysics();

    // After step, velocity damping preserves momentum (damping ~ 0.92-0.96)
    expect(c.vx).toBeGreaterThan(5);
    expect(c.x).toBeGreaterThan(100);
  });

  it('links two creatures dropped within 120px', () => {
    const c0 = eco.creatures[0];
    const c1 = eco.creatures[1];
    c0.x = 100;
    c0.y = 100;
    c1.x = 180; // distance = 80px <= 120px
    c1.y = 100;

    eco.checkDropLinking(c0);

    expect(eco.links).toHaveLength(1);
    expect(eco.links[0].a).toBe(c0);
    expect(eco.links[0].b).toBe(c1);
    expect(eco.links[0].alpha).toBe(1.0);
  });

  it('does not link creatures dropped farther than 120px', () => {
    const c0 = eco.creatures[0];
    const c1 = eco.creatures[1];
    c0.x = 100;
    c0.y = 100;
    c1.x = 300; // distance = 200px > 120px
    c1.y = 100;

    eco.checkDropLinking(c0);

    expect(eco.links).toHaveLength(0);
  });

  it('caps simultaneous links at 6', () => {
    const c0 = eco.creatures[0];
    c0.x = 100;
    c0.y = 100;

    // Position other creatures within 100px
    for (let i = 1; i <= 8; i++) {
      eco.creatures[i].x = 100 + i * 5;
      eco.creatures[i].y = 100 + i * 5;
    }

    eco.checkDropLinking(c0);
    expect(eco.links.length).toBeLessThanOrEqual(MAX_SIMULTANEOUS_LINKS);
    expect(MAX_SIMULTANEOUS_LINKS).toBe(6);
  });

  it('breaks link when creatures are pulled beyond 220px', () => {
    const c0 = eco.creatures[0];
    const c1 = eco.creatures[1];
    c0.x = 100;
    c0.y = 100;
    c1.x = 180;
    c1.y = 100;

    eco.checkDropLinking(c0);
    expect(eco.links).toHaveLength(1);

    // Pull apart beyond 220px
    c1.x = 350; // distance = 250px > 220px
    eco.stepPhysics();

    expect(eco.links).toHaveLength(0);
  });

  it('fades out links after 8000ms', () => {
    const c0 = eco.creatures[0];
    const c1 = eco.creatures[1];
    c0.x = 100;
    c0.y = 100;
    c1.x = 160;
    c1.y = 100;

    eco.checkDropLinking(c0);
    expect(eco.links).toHaveLength(1);

    // Step at t = now + 8500ms
    const futureTime = eco.links[0].createdAt + LINK_LIFETIME_MS + 100;
    eco.stepPhysics(-9999, -9999, 0, false, futureTime);

    expect(eco.links[0].alpha).toBeLessThan(1.0);
  });

  it('applies repulsive force to avoid text obstacles', () => {
    const c = eco.creatures[0];
    c.x = 150;
    c.y = 150;
    c.vx = 0;
    c.vy = 0;
    c.isDragged = false;

    // Obstacle right at (160, 150)
    (eco as any).textObstacles = [
      { x: 155, y: 140, width: 60, height: 30 },
    ];

    eco.stepPhysics();

    // Creature should be pushed left away from obstacle
    expect(c.vx).toBeLessThan(0);
  });

  it('applies soft boundary force near canvas edges', () => {
    const c = eco.creatures[0];
    c.x = 10; // near left boundary
    c.y = 200;
    c.vx = 0;
    c.vy = 0;
    c.isDragged = false;

    eco.stepPhysics();

    // Should be pushed inward to the right (positive vx)
    expect(c.vx).toBeGreaterThan(0);
  });
});
