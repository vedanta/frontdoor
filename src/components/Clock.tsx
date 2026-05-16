'use client';

/**
 * Ticking clock — one of two MVP client components.
 *
 * Renders an empty placeholder during SSR + initial client (no hydration
 * mismatch), then fills in on the next macrotask via setTimeout(0). Updates
 * every 1s.
 *
 * Click-to-toggle (#43): clicking the clock cycles 24h ↔ 12h format. Choice
 * persists in localStorage under `frontdoor.clockFormat`. The clock is a
 * `<button>` so it's keyboard-accessible (Space/Enter); CSS resets the button
 * chrome so it visually matches the original `<div>` design.
 *
 * Per design/02-aesthetic-and-rendering.md → "the only animation is the clock
 * ticking."
 */
import { useEffect, useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export type ClockFormat = '24h' | '12h';
const STORAGE_KEY = 'frontdoor.clockFormat';
const DEFAULT_FORMAT: ClockFormat = '24h';

function readStoredFormat(): ClockFormat {
  if (typeof window === 'undefined') return DEFAULT_FORMAT;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === '12h' || v === '24h' ? v : DEFAULT_FORMAT;
  } catch {
    return DEFAULT_FORMAT;
  }
}

export function formatNow(
  now: Date = new Date(),
  format: ClockFormat = DEFAULT_FORMAT,
): { time: string; date: string } {
  const h24 = now.getHours();
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());

  let time: string;
  if (format === '12h') {
    // 1..12 (0→12, 13→1, etc.). No AM/PM suffix — kept off for minimalism;
    // the user can tell morning from afternoon from context. Means midnight
    // and noon both render as 12:00:00 (a known ambiguity).
    const h12 = ((h24 + 11) % 12) + 1;
    time = `${pad(h12)}:${m}:${s}`;
  } else {
    time = `${pad(h24)}:${m}:${s}`;
  }

  return {
    time,
    date: `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
  };
}

export function Clock() {
  const [view, setView] = useState<{ time: string; date: string } | null>(null);
  const [format, setFormat] = useState<ClockFormat>(DEFAULT_FORMAT);

  // Hydrate format from localStorage — defer via setTimeout(0) so setState lands
  // in a callback, not the effect body (Next 16 lint rule).
  useEffect(() => {
    const t = setTimeout(() => setFormat(readStoredFormat()), 0);
    return () => clearTimeout(t);
  }, []);

  // Initial fill + 1s tick. Re-runs when format changes so a click-toggle
  // updates the display immediately (rather than waiting for the next second).
  useEffect(() => {
    const update = () => setView(formatNow(new Date(), format));
    const initial = setTimeout(update, 0);
    const tick = setInterval(update, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(tick);
    };
  }, [format]);

  const toggleFormat = () => {
    const next: ClockFormat = format === '24h' ? '12h' : '24h';
    setFormat(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage may be disabled; setState alone is enough for the session */
    }
  };

  return (
    <>
      <button
        type="button"
        className="clock"
        onClick={toggleFormat}
        aria-label={`switch to ${format === '24h' ? '12-hour' : '24-hour'} clock`}
        title="click to switch 12h / 24h"
      >
        {view?.time ?? ' '}
      </button>
      <div className="clock-date">{view?.date ?? ' '}</div>
    </>
  );
}
