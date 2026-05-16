'use client';

/**
 * Ticking clock — one of only two client components in MVP.
 * Renders an empty placeholder during SSR and the first client render (so
 * server/client agree → no hydration mismatch), then fills in on the next
 * microtask via setTimeout(0) and updates every 1s.
 *
 * Per design/02-aesthetic-and-rendering.md → "the only animation is the clock
 * ticking."
 */
import { useEffect, useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatNow(now: Date = new Date()): { time: string; date: string } {
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    date: `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
  };
}

export function Clock() {
  const [view, setView] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    // Defer the initial set to the next macrotask — keeps the setState out of
    // the effect body itself (the React/Next lint rule discourages synchronous
    // setState in effects) while still filling the clock in immediately.
    const initial = setTimeout(() => setView(formatNow()), 0);
    const tick = setInterval(() => setView(formatNow()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(tick);
    };
  }, []);

  return (
    <>
      <div className="clock">{view?.time ?? ' '}</div>
      <div className="clock-date">{view?.date ?? ' '}</div>
    </>
  );
}
