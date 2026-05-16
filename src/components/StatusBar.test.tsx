import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { StatusBar, FONT_SIZES } from './StatusBar';

const STORAGE_KEY = 'frontdoor.fontSize';

// jsdom in this env doesn't auto-provide window.localStorage; install a
// Map-backed stub once for the whole file.
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
  document.documentElement.style.removeProperty('--page-font-size');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StatusBar — uptime + storage', () => {
  it('renders placeholder dashes initially, then fills in after the first tick', () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('session —');

    act(() => {
      vi.advanceTimersByTime(1); // setTimeout(0) fires
    });
    // Even with no storage, uptime starts at 0m
    expect(container.textContent).toMatch(/session 0m/);
  });

  it('uptime advances on the 60s interval', () => {
    const { container } = render(<StatusBar />);
    act(() => {
      vi.advanceTimersByTime(1); // initial fill
    });
    expect(container.textContent).toMatch(/session 0m/);

    act(() => {
      vi.advanceTimersByTime(2 * 60_000); // +2 minutes (interval + system time)
    });
    expect(container.textContent).toMatch(/session 2m/);
  });

  it('uses navigator.storage.estimate when available', async () => {
    const origStorage = (navigator as { storage?: unknown }).storage;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 1_048_576 * 3.7 }) }, // 3.7 MB
    });

    const { container } = render(<StatusBar />);
    await act(async () => {
      vi.advanceTimersByTime(1);
      // let the awaited estimate microtask settle
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/storage 3\.7mb/);

    Object.defineProperty(navigator, 'storage', { configurable: true, value: origStorage });
  });
});

describe('StatusBar — A−/A+ font controls', () => {
  it('renders both buttons + current size label', () => {
    const { container } = render(<StatusBar />);
    const buttons = container.querySelectorAll('.status-fontsize button');
    expect(buttons.length).toBe(2);
    expect(container.textContent).toContain('13px'); // default
  });

  it('A+ steps font size up + applies CSS variable + persists to localStorage', () => {
    const { getByLabelText, container } = render(<StatusBar />);
    fireEvent.click(getByLabelText('bigger font'));
    expect(container.textContent).toContain('15px');
    expect(document.documentElement.style.getPropertyValue('--page-font-size')).toBe('15px');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('15');
  });

  it('A− steps font size down', () => {
    const { getByLabelText, container } = render(<StatusBar />);
    fireEvent.click(getByLabelText('smaller font'));
    expect(container.textContent).toContain('11px');
    expect(document.documentElement.style.getPropertyValue('--page-font-size')).toBe('11px');
  });

  it('disables A− at minimum size', () => {
    window.localStorage.setItem(STORAGE_KEY, String(FONT_SIZES[0]));
    const { getByLabelText } = render(<StatusBar />);
    act(() => {
      vi.advanceTimersByTime(1); // let useEffect read localStorage
    });
    expect(getByLabelText('smaller font')).toBeDisabled();
    expect(getByLabelText('bigger font')).not.toBeDisabled();
  });

  it('disables A+ at maximum size', () => {
    window.localStorage.setItem(STORAGE_KEY, String(FONT_SIZES[FONT_SIZES.length - 1]));
    const { getByLabelText } = render(<StatusBar />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getByLabelText('bigger font')).toBeDisabled();
    expect(getByLabelText('smaller font')).not.toBeDisabled();
  });

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '17');
    const { container } = render(<StatusBar />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).toContain('17px');
  });

  it('ignores corrupt localStorage values (falls back to default)', () => {
    window.localStorage.setItem(STORAGE_KEY, '99'); // not in FONT_SIZES
    const { container } = render(<StatusBar />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).toContain('13px');
  });
});
