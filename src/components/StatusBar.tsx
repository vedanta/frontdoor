'use client';

/**
 * StatusBar — third (and final) MVP client component.
 * Lives at the bottom of the shell on every page.
 *
 * - Uptime: session minutes since the component mounted, refreshed every 60s.
 * - Storage: navigator.storage.estimate() (MB used), polled with uptime.
 * - Font controls: A− / A+ buttons that step --page-font-size through
 *   {11, 13, 15, 17} px and persist via localStorage.
 *
 * Hydration-safe: numeric labels start blank until the first effect tick
 * fills them in (no SSR/CSR mismatch).
 *
 * The flash-of-default-font-size on initial paint is avoided by an inline
 * script in src/app/layout.tsx that reads localStorage BEFORE React boots.
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

export function StatusBar() {
  const [view, setView] = useState<{ uptimeMin: number; storageMb: number | null } | null>(null);
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);

  // Initial fill + 60s uptime/storage interval. Defer via setTimeout(0) to keep
  // setState out of the effect body (Next 16 lint rule — same as <Clock/>).
  useEffect(() => {
    const bootTime = Date.now();
    const tick = async () => {
      const uptimeMin = Math.floor((Date.now() - bootTime) / 60_000);
      let storageMb: number | null = null;
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (typeof est.usage === 'number') {
            storageMb = Math.round((est.usage / 1_048_576) * 10) / 10;
          }
        } catch {
          /* swallow */
        }
      }
      setView({ uptimeMin, storageMb });
    };
    const initial = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  // Hydrate font size from localStorage (the inline script in layout.tsx already
  // applied the visual change; this just syncs React state for the controls).
  useEffect(() => {
    setFontSize(readStoredFontSize());
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
    <div className="statusbar">
      <div className="status-item">
        <span className="status-dot" />
        <span>session {view ? `${view.uptimeMin}m` : '—'}</span>
      </div>
      <div className="status-item">
        <span>
          storage{' '}
          {view?.storageMb !== null && view?.storageMb !== undefined ? `${view.storageMb}mb` : '—'}
        </span>
      </div>
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
    </div>
  );
}
