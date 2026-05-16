import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { Clock, formatNow } from './Clock';

const STORAGE_KEY = 'frontdoor.clockFormat';

// jsdom in this env doesn't auto-provide window.localStorage; stub it.
beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatNow (pure)', () => {
  it('24h: HH:MM:SS', () => {
    const d = new Date(2026, 4, 15, 14, 32, 9);
    expect(formatNow(d, '24h').time).toBe('14:32:09');
  });

  it('24h: zero-pads single digits', () => {
    const d = new Date(2026, 0, 1, 1, 2, 3);
    expect(formatNow(d, '24h').time).toBe('01:02:03');
  });

  it('12h: HH:MM:SS p for 14:32 (afternoon)', () => {
    const d = new Date(2026, 4, 15, 14, 32, 9);
    expect(formatNow(d, '12h').time).toBe('02:32:09 p');
  });

  it('12h: handles midnight as 12:00:00 a', () => {
    const d = new Date(2026, 4, 15, 0, 0, 0);
    expect(formatNow(d, '12h').time).toBe('12:00:00 a');
  });

  it('12h: handles noon as 12:00:00 p', () => {
    const d = new Date(2026, 4, 15, 12, 0, 0);
    expect(formatNow(d, '12h').time).toBe('12:00:00 p');
  });

  it('12h: 1pm as 01:00:00 p', () => {
    const d = new Date(2026, 4, 15, 13, 0, 0);
    expect(formatNow(d, '12h').time).toBe('01:00:00 p');
  });

  it('date format unchanged across formats', () => {
    const d = new Date(2026, 4, 15, 12, 0, 0);
    expect(formatNow(d, '12h').date).toBe(formatNow(d, '24h').date);
  });

  it('defaults to 24h when no format given', () => {
    const d = new Date(2026, 4, 15, 14, 32, 9);
    expect(formatNow(d).time).toBe('14:32:09');
  });
});

describe('Clock (component)', () => {
  it('starts empty (no hydration mismatch), fills in on the next tick', () => {
    const { container } = render(<Clock />);
    expect(container.querySelector('.clock')?.textContent?.trim()).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('clicking the clock toggles 24h → 12h → 24h, persists in localStorage', () => {
    const { container } = render(<Clock />);
    // Drain both effects' setTimeout(0)s — hydrate-from-storage + initial fill
    act(() => {
      vi.advanceTimersByTime(5);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(/^\d{2}:\d{2}:\d{2}$/); // 24h

    // First click → 12h. Click commits state, then we drain the new effect's setTimeout(0).
    act(() => {
      fireEvent.click(container.querySelector('.clock')!);
    });
    act(() => {
      vi.advanceTimersByTime(5);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(
      /^\d{2}:\d{2}:\d{2} [ap]$/,
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('12h');

    // Second click → back to 24h
    act(() => {
      fireEvent.click(container.querySelector('.clock')!);
    });
    act(() => {
      vi.advanceTimersByTime(5);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('24h');
  });

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '12h');
    const { container } = render(<Clock />);
    // Drain both the hydrate effect and the post-hydrate tick-effect re-run
    act(() => {
      vi.advanceTimersByTime(5);
    });
    act(() => {
      vi.advanceTimersByTime(5);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(
      /^\d{2}:\d{2}:\d{2} [ap]$/,
    );
  });

  it('ignores corrupt localStorage value (falls back to 24h)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'banana');
    const { container } = render(<Clock />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('aria-label and title reflect the next action', () => {
    const { container } = render(<Clock />);
    act(() => {
      vi.advanceTimersByTime(5);
    });
    const button = container.querySelector('.clock')!;
    // Default 24h → label says "switch to 12-hour"
    expect(button.getAttribute('aria-label')).toBe('switch to 12-hour clock');

    act(() => {
      fireEvent.click(button);
    });
    expect(button.getAttribute('aria-label')).toBe('switch to 24-hour clock');
  });
});
