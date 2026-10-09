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
      querySelector: () => mockCardEl,
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

    const attrs: Record<string, string> = { 'aria-pressed': 'false' };
    mockCardEl = {
      dataset: { repo: 'test' },
      classList: {
        toggle: () => {},
      },
      getAttribute: (name: string) => attrs[name] || null,
      setAttribute: (name: string, val: string) => {
        attrs[name] = val;
      },
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

  it('REPRODUCTION BUG 1: double init causes duplicate click listeners that cancel flip', () => {
    // Create mock DOM structure
    type Listener = (e: { target: unknown; key?: string; defaultPrevented?: boolean }) => void;
    const listeners: Record<string, Listener[]> = {};
    const mockGrid = {
      addEventListener: (type: string, fn: Listener) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      closest: () => null,
      querySelectorAll: () => [mockWrapper],
    };

    const origDoc = globalThis.document;
    const origWin = globalThis.window;
    globalThis.window = {
      addEventListener: () => {},
    } as unknown as Window & typeof globalThis;
    globalThis.document = {
      getElementById: () => mockGrid,
      addEventListener: () => {},
      hidden: false,
    } as unknown as Document;

    mockCardEl.closest = ((sel: string) => sel === '.project-card' ? mockCardEl : null) as unknown as HTMLElement['closest'];

    const mgrInstance = new ProjectsPendulumManager();

    // First init attaches click listener #1
    mgrInstance.init('mock-grid');
    expect(listeners['click'].length).toBe(1);

    // Second init (as happened when both bootstrap.ts and main.ts initialized it)
    mgrInstance.init('mock-grid');
    // If NOT guarded, listeners count is 2:
    const clickListenersCount = listeners['click'].length;

    // Simulate click event
    const card = mgrInstance.cards[0];
    const clickEvent = { target: mockCardEl };

    listeners['click'].forEach((listener) => listener(clickEvent));

    // Restore document & window
    globalThis.document = origDoc;
    globalThis.window = origWin;

    // If duplicate listeners existed, card was toggled twice (false -> true -> false)
    // EXPECTATION: card must be flipped (true), proving single listener idempotency!
    expect(clickListenersCount).toBe(1);
    expect(card.isFlipped).toBe(true);
  });

  it('distinguishes tap (<8px, <300ms) from drag (>=8px): drag does not flip card', () => {
    type Listener = (e: { clientX: number; clientY: number; target: unknown }) => void;
    const listeners: Record<string, Listener[]> = {};
    const mockGrid = {
      addEventListener: (type: string, fn: Listener) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      closest: () => null,
      querySelectorAll: () => [mockWrapper],
    };

    const origDoc = globalThis.document;
    const origWin = globalThis.window;
    globalThis.window = { addEventListener: () => {} } as unknown as Window & typeof globalThis;
    globalThis.document = {
      getElementById: () => mockGrid,
      addEventListener: () => {},
      hidden: false,
    } as unknown as Document;

    mockCardEl.closest = ((sel: string) => sel === '.project-card' ? mockCardEl : null) as unknown as HTMLElement['closest'];

    const mgrInstance = new ProjectsPendulumManager();
    mgrInstance.init('mock-grid');
    const card = mgrInstance.cards[0];
    expect(mgrInstance.isFlipped(card)).toBe(false);

    // Simulate drag: pointerdown at (100, 100), pointermove to (150, 100) -> 50px drag!
    listeners['pointerdown'][0]({ clientX: 100, clientY: 100, target: mockCardEl });
    listeners['pointermove'][0]({ clientX: 150, clientY: 100, target: mockCardEl });
    // Click dispatched after drag
    listeners['click'][0]({ clientX: 150, clientY: 100, target: mockCardEl });

    // Drag MUST NOT flip the card!
    expect(mgrInstance.isFlipped(card)).toBe(false);

    // Now simulate genuine tap: pointerdown at (100, 100), pointermove to (102, 101) -> 2.2px move (<8px)
    listeners['pointerdown'][0]({ clientX: 100, clientY: 100, target: mockCardEl });
    listeners['pointermove'][0]({ clientX: 102, clientY: 101, target: mockCardEl });
    listeners['click'][0]({ clientX: 102, clientY: 101, target: mockCardEl });

    // Tap MUST flip the card!
    expect(mgrInstance.isFlipped(card)).toBe(true);

    globalThis.document = origDoc;
    globalThis.window = origWin;
  });

  it('clicking external project-link on back face does not flip card back', () => {
    type Listener = (e: { target: unknown }) => void;
    const listeners: Record<string, Listener[]> = {};
    const mockGrid = {
      addEventListener: (type: string, fn: Listener) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      closest: () => null,
      querySelectorAll: () => [mockWrapper],
    };

    const origDoc = globalThis.document;
    const origWin = globalThis.window;
    globalThis.window = { addEventListener: () => {} } as unknown as Window & typeof globalThis;
    globalThis.document = {
      getElementById: () => mockGrid,
      addEventListener: () => {},
      hidden: false,
    } as unknown as Document;

    const mockLink = {
      closest: (sel: string) => sel === '.project-link' ? mockLink : (sel === '.project-card' ? mockCardEl : null),
    };

    const mgrInstance = new ProjectsPendulumManager();
    mgrInstance.init('mock-grid');
    const card = mgrInstance.cards[0];

    // Flip card open first
    mgrInstance.setFlip(card, true);
    expect(mgrInstance.isFlipped(card)).toBe(true);

    // Click on link
    listeners['click'][0]({ target: mockLink });

    // Should remain flipped!
    expect(mgrInstance.isFlipped(card)).toBe(true);

    globalThis.document = origDoc;
    globalThis.window = origWin;
  });
});
