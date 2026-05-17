import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { FontControls, FONT_SIZES } from './FontControls';

const STORAGE_KEY = 'frontdoor.fontSize';

// jsdom in this env doesn't auto-provide window.localStorage; install a
// Map-backed stub once for the whole file. (Same pattern as the old
// StatusBar.test.tsx before #67 split FontControls out.)
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

describe('FontControls', () => {
  it('renders A− / A+ buttons + current size label', () => {
    const { container } = render(<FontControls />);
    const buttons = container.querySelectorAll('.status-fontsize button');
    expect(buttons.length).toBe(2);
    expect(container.textContent).toContain('13px'); // default
  });

  it('A+ steps font size up + applies CSS variable + persists to localStorage', () => {
    const { getByLabelText, container } = render(<FontControls />);
    fireEvent.click(getByLabelText('bigger font'));
    expect(container.textContent).toContain('15px');
    expect(document.documentElement.style.getPropertyValue('--page-font-size')).toBe('15px');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('15');
  });

  it('A− steps font size down', () => {
    const { getByLabelText, container } = render(<FontControls />);
    fireEvent.click(getByLabelText('smaller font'));
    expect(container.textContent).toContain('11px');
    expect(document.documentElement.style.getPropertyValue('--page-font-size')).toBe('11px');
  });

  it('disables A− at minimum size', () => {
    window.localStorage.setItem(STORAGE_KEY, String(FONT_SIZES[0]));
    const { getByLabelText } = render(<FontControls />);
    act(() => {
      vi.advanceTimersByTime(1); // let useEffect read localStorage
    });
    expect(getByLabelText('smaller font')).toBeDisabled();
    expect(getByLabelText('bigger font')).not.toBeDisabled();
  });

  it('disables A+ at maximum size', () => {
    window.localStorage.setItem(STORAGE_KEY, String(FONT_SIZES[FONT_SIZES.length - 1]));
    const { getByLabelText } = render(<FontControls />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getByLabelText('bigger font')).toBeDisabled();
    expect(getByLabelText('smaller font')).not.toBeDisabled();
  });

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '17');
    const { container } = render(<FontControls />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).toContain('17px');
  });

  it('ignores corrupt localStorage values (falls back to default)', () => {
    window.localStorage.setItem(STORAGE_KEY, '99'); // not in FONT_SIZES
    const { container } = render(<FontControls />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).toContain('13px');
  });
});
