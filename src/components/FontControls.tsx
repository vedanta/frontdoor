'use client';

/**
 * FontControls — the only client-y bit of the dashboard StatusBar.
 *
 * A− / A+ buttons step the document's `--page-font-size` through
 * {11, 13, 15, 17} px and persist the choice in `localStorage` under
 * `frontdoor.fontSize`. An inline `<script>` in `src/app/layout.tsx`
 * applies the stored size BEFORE React hydrates, so first paint is at the
 * chosen size (no flash).
 *
 * Extracted from the old StatusBar (#51) when StatusBar became a server
 * component for #67 — every other status-bar item is now computable on
 * the server.
 */
import { useEffect, useState } from 'react';

// 4-step discrete scale; 13 is the design default.
export const FONT_SIZES = [11, 13, 15, 17] as const;
type FontSize = (typeof FONT_SIZES)[number];

const DEFAULT_FONT_SIZE: FontSize = 13;
const STORAGE_KEY = 'frontdoor.fontSize';

function readStoredFontSize(): FontSize {
  if (typeof window === 'undefined') return DEFAULT_FONT_SIZE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FONT_SIZE;
    const n = parseInt(raw, 10);
    return (FONT_SIZES as readonly number[]).includes(n) ? (n as FontSize) : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

function applyFontSize(size: FontSize): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--page-font-size', `${size}px`);
  try {
    window.localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    /* localStorage may be disabled; fall through silently */
  }
}

export function FontControls() {
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);

  // Hydrate from localStorage on mount. The inline script in layout.tsx has
  // already applied the visual change before this fires; this just syncs
  // React state for the controls.
  // Defer to setTimeout(0) so setState lands in a callback, not the effect
  // body (Next 16 lint rule — same pattern as <Clock/>'s initial fill).
  useEffect(() => {
    const t = setTimeout(() => setFontSize(readStoredFontSize()), 0);
    return () => clearTimeout(t);
  }, []);

  const idx = FONT_SIZES.indexOf(fontSize);
  const canSmaller = idx > 0;
  const canBigger = idx < FONT_SIZES.length - 1;

  const change = (delta: -1 | 1) => {
    const next = FONT_SIZES[idx + delta];
    if (next === undefined) return;
    setFontSize(next);
    applyFontSize(next);
  };

  return (
    <div className="status-fontsize" aria-label="page font size">
      <button
        type="button"
        onClick={() => change(-1)}
        disabled={!canSmaller}
        aria-label="smaller font"
      >
        A−
      </button>
      <span className="status-fontsize-current">{fontSize}px</span>
      <button
        type="button"
        onClick={() => change(1)}
        disabled={!canBigger}
        aria-label="bigger font"
      >
        A+
      </button>
    </div>
  );
}
