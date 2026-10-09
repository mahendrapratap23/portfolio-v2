import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContactPlaneManager,
  FOLD_DURATION_MS,
  FLY_DURATION_MS,
  MAX_MAILTO_TIMEOUT_MS,
} from './contact-plane';

describe('ContactPlaneManager Specs & Reliability', () => {
  let mgr: ContactPlaneManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new ContactPlaneManager();
  });

  it('verifies spec animation and timeout constants', () => {
    expect(FOLD_DURATION_MS).toBe(700);
    expect(FLY_DURATION_MS).toBe(800);
    expect(MAX_MAILTO_TIMEOUT_MS).toBeLessThanOrEqual(1500);
  });

  it('preserves exact existing email address', () => {
    expect(mgr.mailtoHref).toBe('mailto:mp498343@gmail.com');
  });

  it('never blocks mailto longer than 1.5s (safety timeout)', () => {
    let opened = false;
    mgr.openMailto = () => {
      opened = true;
    };

    const mockClassList = { add: () => {}, remove: () => {} };
    mgr.noteEl = { classList: mockClassList } as unknown as HTMLElement;
    mgr.planeEl = { classList: mockClassList } as unknown as HTMLElement;

    mgr.send();
    expect(mgr.state).toBe('folding');

    // Advance 1500ms
    vi.advanceTimersByTime(1500);

    expect(opened).toBe(true);
  });

  it('resets cleanly when reset() is called', () => {
    mgr.state = 'sent';
    const mockClassList = { add: () => {}, remove: () => {} };
    mgr.noteEl = { classList: mockClassList } as unknown as HTMLElement;
    mgr.planeEl = { classList: mockClassList } as unknown as HTMLElement;
    mgr.sendBtn = { style: { display: '' }, focus: () => {} } as unknown as HTMLButtonElement;
    mgr.resetBtn = { style: { display: '' }, focus: () => {} } as unknown as HTMLButtonElement;

    mgr.reset();

    expect(mgr.state).toBe('idle');
    expect(mgr.sendBtn.style.display).toBe('inline-flex');
    expect(mgr.resetBtn.style.display).toBe('none');
  });

  it('runs full animation sequence: folding (700ms) -> flying (800ms) -> sent', () => {
    let opened = false;
    mgr.openMailto = () => {
      opened = true;
    };

    const addedClasses: string[] = [];
    const removedClasses: string[] = [];
    const mockClassList = {
      add: (c: string) => addedClasses.push(c),
      remove: (c: string) => removedClasses.push(c),
    };

    mgr.noteEl = { classList: mockClassList } as unknown as HTMLElement;
    mgr.planeEl = { classList: mockClassList } as unknown as HTMLElement;
    mgr.trailEl = { classList: mockClassList } as unknown as HTMLElement;
    mgr.sendBtn = { style: { display: '' } } as unknown as HTMLButtonElement;
    mgr.resetBtn = { style: { display: '' }, focus: () => {} } as unknown as HTMLButtonElement;

    mgr.send();
    expect(mgr.state).toBe('folding');
    expect(addedClasses).toContain('is-folding');

    // 700ms: folds and starts flying
    vi.advanceTimersByTime(700);
    expect(mgr.state).toBe('flying');
    expect(removedClasses).toContain('is-folding');
    expect(addedClasses).toContain('is-hidden');
    expect(addedClasses).toContain('is-flying');

    // 800ms: finishes flying and sends
    vi.advanceTimersByTime(800);
    expect(mgr.state).toBe('sent');
    expect(opened).toBe(true);
    expect(addedClasses).toContain('is-gone');
  });

  it('immediately triggers mailto in reduced-motion mode without blocking', () => {
    let opened = false;
    mgr.openMailto = () => {
      opened = true;
    };

    // Simulate RM
    (mgr as unknown as { isRM: boolean }).isRM = true;
    mgr.noteEl = {} as unknown as HTMLElement;
    mgr.planeEl = {} as unknown as HTMLElement;
    mgr.sendBtn = { style: { display: '' } } as unknown as HTMLButtonElement;
    mgr.resetBtn = { style: { display: '' }, focus: () => {} } as unknown as HTMLButtonElement;

    mgr.send();
    expect(opened).toBe(true);
    expect(mgr.state).toBe('sent');
  });
});
