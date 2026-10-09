import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContactPlaneManager,
  FOLD_DURATION_MS,
  FLY_DURATION_MS,
  SENT_WAIT_MS,
  RETURN_DURATION_MS,
  MAX_MAILTO_TIMEOUT_MS,
} from './contact-plane';

describe('ContactPlaneManager Explicit State Machine & Bug 2 Fixes', () => {
  let mgr: ContactPlaneManager;
  let addedClasses: string[];
  let removedClasses: string[];
  let mockNote: HTMLElement;
  let mockPlane: HTMLElement;
  let mockTrail: HTMLElement;
  let mockBtn: HTMLButtonElement;
  let mockStatus: HTMLElement;
  let mailtoCallCount: number;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new ContactPlaneManager();
    addedClasses = [];
    removedClasses = [];
    mailtoCallCount = 0;

    const createMockElement = () => ({
      classList: {
        add: (c: string) => addedClasses.push(c),
        remove: (c: string) => removedClasses.push(c),
        contains: (c: string) => addedClasses.includes(c) && !removedClasses.includes(c),
      },
      style: { transform: '', opacity: '', animation: '', display: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
    } as unknown as HTMLElement);

    mockNote = createMockElement();
    mockPlane = createMockElement();
    mockTrail = createMockElement();
    mockBtn = {
      ...createMockElement(),
      disabled: false,
    } as unknown as HTMLButtonElement;
    mockStatus = {
      textContent: '',
    } as unknown as HTMLElement;

    mgr.noteEl = mockNote;
    mgr.planeEl = mockPlane;
    mgr.trailEl = mockTrail;
    mgr.sendBtn = mockBtn;
    mgr.statusEl = mockStatus;

    mgr.openMailto = () => {
      if (mgr.mailtoOpened) return;
      mgr.mailtoOpened = true;
      mailtoCallCount++;
    };
  });

  it('verifies explicit spec timing constants', () => {
    expect(FOLD_DURATION_MS).toBe(700);
    expect(FLY_DURATION_MS).toBe(800);
    expect(SENT_WAIT_MS).toBe(600);
    expect(RETURN_DURATION_MS).toBe(500);
    expect(MAX_MAILTO_TIMEOUT_MS).toBeLessThanOrEqual(1500);
  });

  it('preserves exact existing email address', () => {
    expect(mgr.mailtoHref).toBe('mailto:mp498343@gmail.com');
  });

  it('executes full explicit state machine: idle -> folding -> flying -> sent -> returning -> idle', () => {
    expect(mgr.state).toBe('idle');
    expect(mockBtn.disabled).toBe(false);

    mgr.send();

    // 1. FOLDING (700 ms)
    expect(mgr.state).toBe('folding');
    expect(mockBtn.disabled).toBe(true);
    expect(addedClasses).toContain('is-folding');

    // Advance 750 ms (guaranteed exit fallback)
    vi.advanceTimersByTime(FOLD_DURATION_MS + 50);

    // 2. FLYING (800 ms)
    expect(mgr.state).toBe('flying');
    expect(removedClasses).toContain('is-folding');
    expect(addedClasses).toContain('is-hidden');
    expect(addedClasses).toContain('is-flying');
    expect(mailtoCallCount).toBe(1);

    // Advance 850 ms (flight complete)
    vi.advanceTimersByTime(FLY_DURATION_MS + 50);

    // 3. SENT (600 ms wait)
    expect(mgr.state).toBe('sent');
    expect(mockStatus.textContent).toBe('sent. write again?');

    // Advance 600 ms (sent wait)
    vi.advanceTimersByTime(SENT_WAIT_MS);

    // 4. RETURNING (500 ms)
    expect(mgr.state).toBe('returning');
    expect(removedClasses).toContain('is-hidden');
    expect(addedClasses).toContain('is-returning');

    // Advance 550 ms (return complete)
    vi.advanceTimersByTime(RETURN_DURATION_MS + 50);

    // 5. IDLE (Restored completely)
    expect(mgr.state).toBe('idle');
    expect(mockBtn.disabled).toBe(false);
    expect(mockStatus.textContent).toBe('');
    expect(removedClasses).toContain('is-returning');
  });

  it('opens mailto exactly once even on rapid double-tap', () => {
    mgr.send();
    // Rapid second click during folding
    mgr.send();

    vi.advanceTimersByTime(FOLD_DURATION_MS + 50);
    vi.advanceTimersByTime(FLY_DURATION_MS + 50);

    expect(mailtoCallCount).toBe(1);
  });

  it('enables multiple consecutive sends (e.g. 3 in a row)', () => {
    const totalCycleTime = FOLD_DURATION_MS + 50 + FLY_DURATION_MS + 50 + SENT_WAIT_MS + RETURN_DURATION_MS + 50;

    // Send 1
    mgr.send();
    expect(mgr.state).toBe('folding');
    vi.advanceTimersByTime(totalCycleTime);
    expect(mgr.state).toBe('idle');
    expect(mailtoCallCount).toBe(1);

    // Send 2
    mgr.send();
    expect(mgr.state).toBe('folding');
    vi.advanceTimersByTime(totalCycleTime);
    expect(mgr.state).toBe('idle');
    expect(mailtoCallCount).toBe(2);

    // Send 3
    mgr.send();
    expect(mgr.state).toBe('folding');
    vi.advanceTimersByTime(totalCycleTime);
    expect(mgr.state).toBe('idle');
    expect(mailtoCallCount).toBe(3);
  });

  it('guarantees exit to idle via fallback timers even if transition events are missed', () => {
    // Neither transitionend nor animationend fired
    mgr.send();
    expect(mgr.state).toBe('folding');

    // Advance past all fallbacks
    vi.advanceTimersByTime(3000);

    expect(mgr.state).toBe('idle');
    expect(mockBtn.disabled).toBe(false);
    expect(mailtoCallCount).toBe(1);
  });

  it('never blocks mailto longer than 1.5s under safety timeout', () => {
    let safetyTriggered = false;
    mgr.openMailto = () => {
      safetyTriggered = true;
    };

    mgr.send();
    expect(safetyTriggered).toBe(false);

    vi.advanceTimersByTime(MAX_MAILTO_TIMEOUT_MS);
    expect(safetyTriggered).toBe(true);
  });

  it('reduced-motion mode skips folding & flying, opens mailto and restores to idle at once', () => {
    (mgr as unknown as { isRM: boolean }).isRM = true;

    mgr.send();

    expect(mailtoCallCount).toBe(1);
    expect(mgr.state).toBe('idle');
    expect(mockBtn.disabled).toBe(false);
  });
});
