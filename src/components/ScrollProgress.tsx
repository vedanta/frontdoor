'use client';

/**
 * Scroll-progress bar — the 4th MVP client component (joins Clock, SearchBar,
 * StatusBar). Renders a thin 2px line at the top of the page that fills from
 * left to right as the user scrolls down the dashboard.
 *
 * Math: `window.scrollY / (scrollHeight - innerHeight)` → 0..1, used as
 * `transform: scaleX(progress)` with `transform-origin: 0 0` so it grows
 * from the left edge.
 *
 * Performance: scroll events fire frequently; we coalesce updates to one
 * per requestAnimationFrame so we never paint more than once per frame.
 *
 * Visibility: when the page fits the viewport (scrollHeight <= innerHeight)
 * there's nothing to track — render nothing rather than show a static empty
 * bar.
 *
 * Per #65. Per design/02-aesthetic-and-rendering.md: zero-framework-feel —
 * no library, no transitions, no animations beyond the bar following scroll.
 */
import { useEffect, useState } from 'react';

export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const compute = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) {
        setVisible(false);
        setProgress(0);
        return;
      }
      setVisible(true);
      // Clamp to [0, 1] — overscroll on macOS can produce scrollY > max or < 0.
      const raw = window.scrollY / max;
      setProgress(Math.min(1, Math.max(0, raw)));
    };

    const onChange = () => {
      if (frame) return;
      // Use `window.` qualifier for both rAF + cAF: jsdom (test env) has
      // window.requestAnimationFrame but not the bare cancelAnimationFrame
      // global — being explicit avoids the asymmetry.
      frame = window.requestAnimationFrame(() => {
        compute();
        frame = 0;
      });
    };

    // Initial compute — defer to next macrotask so it runs after hydration
    // settles (matches Clock + StatusBar's pattern for the Next 16 lint rule).
    const initial = setTimeout(compute, 0);
    window.addEventListener('scroll', onChange, { passive: true });
    window.addEventListener('resize', onChange);

    return () => {
      clearTimeout(initial);
      window.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="scroll-progress"
      role="progressbar"
      aria-label="page scroll progress"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ transform: `scaleX(${progress})` }}
    />
  );
}
