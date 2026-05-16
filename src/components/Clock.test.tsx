import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Clock, formatNow } from './Clock';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatNow (pure)', () => {
  it('formats time as HH:MM:SS and date as "Day D Mon YYYY"', () => {
    const d = new Date(2026, 4, 15, 14, 32, 9); // 2026-05-15 14:32:09 local
    const v = formatNow(d);
    expect(v.time).toBe('14:32:09');
    expect(v.date).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) 15 May 2026$/);
  });

  it('zero-pads single digits', () => {
    const d = new Date(2026, 0, 1, 1, 2, 3);
    expect(formatNow(d).time).toBe('01:02:03');
  });
});

describe('Clock (component)', () => {
  it('starts empty (no hydration mismatch), fills in on the next tick', () => {
    const { container } = render(<Clock />);
    expect(container.querySelector('.clock')?.textContent?.trim()).toBe('');
    expect(container.querySelector('.clock-date')?.textContent?.trim()).toBe('');

    // setTimeout(0) fires the initial fill
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.clock')?.textContent ?? '').toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(container.querySelector('.clock-date')?.textContent ?? '').not.toBe('');
  });

  it('updates the time every second', () => {
    const { container } = render(<Clock />);
    act(() => {
      vi.advanceTimersByTime(1); // initial fill
    });
    const t1 = container.querySelector('.clock')?.textContent;

    // Advance system time by 5s, then advance timer to fire the next tick
    act(() => {
      vi.setSystemTime(new Date(Date.now() + 5000));
      vi.advanceTimersByTime(1000);
    });
    const t2 = container.querySelector('.clock')?.textContent;

    expect(t2).not.toBe(t1);
  });
});
