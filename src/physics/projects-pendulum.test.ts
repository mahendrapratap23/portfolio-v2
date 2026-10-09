import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProjectsPendulumManager,
  PENDULUM_SPRING,
  PENDULUM_DAMPING,
  SLEEP_THRESHOLD_R,
  SLEEP_THRESHOLD_VR,
  type PendulumCard,
} from './projects-pendulum';

describe('ProjectsPendulumManager Physics & Flipping', () => {
  let mgr: ProjectsPendulumManager;
  let mockCard: PendulumCard;
  let mockWrapper: HTMLElement;
  let mockCardEl: HTMLElement;

  beforeEach(() => {
    mgr = new ProjectsPendulumManager();
    mgr.isVisible = true;
    mgr.isTabVisible = true;

    mockWrapper = {
      style: {
        transform: '',
        willChange: '',
      },
      getBoundingClientRect: () => ({
        left: 100,
        right: 400,
        top: 100,
        bottom: 300,
        width: 300,
        height: 200,
        x: 100,
        y: 100,
        toJSON: () => {},
      } as DOMRect),
    } as unknown as HTMLElement;

    mockCardEl = {
      classList: {
        toggle: () => {},
      },
      setAttribute: () => {},
      querySelector: () => null,
    } as unknown as HTMLElement;

    mockCard = {
      id: 'test-project',
      wrapperEl: mockWrapper,
      cardEl: mockCardEl,
      r: 0.03,
      vr: 0,
      restR: 0.03,
      isSleeping: true,
      isFlipped: false,
      rect: null,
    };

    mgr.cards = [mockCard];
  });

  it('verifies spec physics constants', () => {
    expect(PENDULUM_SPRING).toBe(0.05);
    expect(PENDULUM_DAMPING).toBe(0.96);
  });

  it('remains sleeping when undisturbed at rest tilt', () => {
    mgr.stepPhysics();
    expect(mockCard.isSleeping).toBe(true);
    expect(mockCard.r).toBe(0.03);
    expect(mockCard.vr).toBe(0);
  });

  it('spring accelerates displaced card back toward rest tilt', () => {
    mockCard.r = 0.15; // displaced by +0.12 rad
    mockCard.isSleeping = false;

    mgr.stepPhysics();

    const expectedForce = -(0.15 - 0.03) * PENDULUM_SPRING; // -0.12 * 0.05 = -0.006
    const expectedVr = expectedForce * PENDULUM_DAMPING; // -0.006 * 0.96 = -0.00576
    expect(mockCard.vr).toBeCloseTo(expectedVr, 5);
    expect(mockCard.r).toBeCloseTo(0.15 + expectedVr, 5);
  });

  it('applies brush angular impulse based on touch side and speed', () => {
    mockCard.isSleeping = true;
    // Pen inside card bounds: x=150 (left of card center at 250), speed=10
    mgr.handlePointerBrush(150, 150, 10);

    expect(mockCard.isSleeping).toBe(false);
    expect(mockCard.vr).not.toBe(0);
    // Left of center should produce positive rotation impulse
    expect(mockCard.vr).toBeGreaterThan(0);
  });

  it('settles card and clears willChange when motion drops below threshold', () => {
    mockCard.r = mockCard.restR + SLEEP_THRESHOLD_R * 0.5;
    mockCard.vr = SLEEP_THRESHOLD_VR * 0.5;
    mockCard.isSleeping = false;
    mockWrapper.style.willChange = 'transform';

    mgr.stepPhysics();

    expect(mockCard.isSleeping).toBe(true);
    expect(mockCard.r).toBe(mockCard.restR);
    expect(mockCard.vr).toBe(0);
    expect(mockWrapper.style.willChange).toBe('auto');
  });

  it('toggles flip state and triggers gentle flip impulse', () => {
    expect(mockCard.isFlipped).toBe(false);
    mgr.toggleFlip(mockCard);
    expect(mockCard.isFlipped).toBe(true);
    expect(mockCard.isSleeping).toBe(false);
    expect(mockCard.vr).toBeCloseTo(0.025, 3);
  });
});
