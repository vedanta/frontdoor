'use client';

/**
 * Search bar — the second of the only two client components in MVP.
 *   - Enter: resolve query via resolveSearchTarget() (shortcut / URL / Google)
 *           and navigate
 *   - Global `/` or `Escape` (outside other inputs): focus + select the bar
 *
 * Per design/02-aesthetic-and-rendering.md → "the search bar (keydown handling
 * + shortcut routing)."
 */
import { useEffect, useRef } from 'react';
import { resolveSearchTarget, type ShortcutMap } from './shortcuts';

type Props = {
  shortcuts: ShortcutMap;
  /** Test seam — defaults to setting window.location.href. */
  navigate?: (url: string) => void;
};

const defaultNavigate = (url: string): void => {
  window.location.href = url;
};

export function SearchBar({ shortcuts, navigate = defaultNavigate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Global focus key — `/` or Escape from anywhere outside an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/' || e.key === 'Escape') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = (inputRef.current?.value ?? '').trim();
    const target = resolveSearchTarget(q, shortcuts);
    if (target) navigate(target);
  };

  return (
    <div className="search-bar">
      <span className="search-icon">⌕</span>
      <input
        ref={inputRef}
        type="text"
        placeholder="search, URL, or shortcut (hn, ny, ws, cg...)"
        spellCheck={false}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
