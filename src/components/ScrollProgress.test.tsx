import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { ScrollProgress } from './ScrollProgress';

/**
 * Tests cover the math (scroll-position → progress fraction), the visibility
 * gate (page fits viewport → render nothing), and the rAF coalescing (multiple
 * scroll events within a frame produce one paint, not N).
 *
 * jsdom doesn't fire scroll events automatically and doesn't have a real
 * `requestAnimationFrame`; we stub both and drive timing explicitly.
 */

// Helper: pin scrollHeight / innerHeight / scrollY. Each test sets its own
// scenario.
function setPageDimensions({
  scrollHeight,
  innerHeight,
  scrollY,
}: {
  scrollHeight: number;
  innerHeight: number;
  scrollY: number;
}) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: scrollY,
  });
}

// rAF stub — call the callback synchronously on flush.
let rafCallbacks: FrameRequestCallback[] = [];
function flushRaf() {
  const cbs = rafCallbacks;
  rafCallbacks = [];
  for (const cb of cbs) cb(performance.now());
}

beforeEach(() => {
  vi.useFakeTimers();
  rafCallbacks = [];
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {
    /* noop in tests — flushRaf is opt-in */
  }) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  // Unmount components NOW (while our rAF/cAF stubs are still in place).
  // RTL's auto-cleanup runs later in afterEach, after vi.useRealTimers()
  // restores jsdom's defaults — which don't include cancelAnimationFrame,
  // so the component's useEffect cleanup would throw.
  cleanup();
  vi.useRealTimers();
});

describe('ScrollProgress', () => {
  it('renders nothing when the page fits the viewport (no scroll possible)', () => {
    setPageDimensions({ scrollHeight: 800, innerHeight: 800, scrollY: 0 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // Either the element is absent, or visible state hasn't flipped on yet
    // (initial render is null pre-effect). After the setTimeout fires, the
    // effect's compute() sets visible=false → null.
    expect(container.querySelector('.scroll-progress')).toBeNull();
  });

  it('renders the bar at 0% on initial scroll-position 0', () => {
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 0 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const bar = container.querySelector('.scroll-progress');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('style')).toContain('scaleX(0)');
    expect(bar?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('progress = 0.5 at half-scrolled', () => {
    // max scrollable = 2000 - 800 = 1200; half = 600
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 600 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const bar = container.querySelector('.scroll-progress');
    expect(bar?.getAttribute('style')).toContain('scaleX(0.5)');
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('progress = 1 at fully scrolled', () => {
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 1200 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const bar = container.querySelector('.scroll-progress');
    expect(bar?.getAttribute('style')).toContain('scaleX(1)');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('clamps overscroll (scrollY > max) to 1', () => {
    // macOS rubber-band overscroll can produce scrollY > max
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 1500 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const bar = container.querySelector('.scroll-progress');
    expect(bar?.getAttribute('style')).toContain('scaleX(1)');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('clamps negative overscroll (scrollY < 0) to 0', () => {
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: -50 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const bar = container.querySelector('.scroll-progress');
    expect(bar?.getAttribute('style')).toContain('scaleX(0)');
    expect(bar?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('updates progress on scroll event (via rAF)', () => {
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 0 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.scroll-progress')?.getAttribute('style')).toContain(
      'scaleX(0)',
    );

    // Scroll halfway, fire the event, flush rAF
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 600 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      flushRaf();
    });
    expect(container.querySelector('.scroll-progress')?.getAttribute('style')).toContain(
      'scaleX(0.5)',
    );
  });

  it('coalesces multiple scroll events within one frame into one update', () => {
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 0 });
    render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });

    // Three scroll events fired in succession (faster than a frame); only one
    // NEW rAF callback should be enqueued (delta check — React internals may
    // queue rAFs we don't control, so absolute count would be brittle).
    const before = rafCallbacks.length;
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 100 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });
    expect(rafCallbacks.length - before).toBe(1);
  });

  it('responds to resize events too (e.g. content reflow shrinks scrollable area)', () => {
    setPageDimensions({ scrollHeight: 2000, innerHeight: 800, scrollY: 600 });
    const { container } = render(<ScrollProgress />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.scroll-progress')?.getAttribute('style')).toContain(
      'scaleX(0.5)',
    );

    // Viewport gets taller — page now fits, bar should disappear
    setPageDimensions({ scrollHeight: 2000, innerHeight: 2000, scrollY: 600 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
      flushRaf();
    });
    expect(container.querySelector('.scroll-progress')).toBeNull();
  });
});
