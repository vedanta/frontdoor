'use client';

/**
 * UseMyLocation — the third (and most opt-in) client component on the dashboard
 * after `<Clock/>` and `<SearchBar/>`. Browser-geolocation precision upgrade
 * for the weather widget (#105).
 *
 * Renders only when the resolved location's source is `edge-geo` or `fallback`
 * (i.e., NOT when the user already has a saved precise location). One click →
 * permission prompt → POST /api/user → router.refresh() → page re-renders
 * with `source: 'user-saved'`, which hides this component.
 *
 * Design choices:
 *   - Button (not auto-prompt) — auto-prompts are universally hated
 *   - Single click flow, no confirmation modal (already opting-in by clicking)
 *   - Errors shown inline as small dim text; no toast or modal
 *   - Uses router.refresh() rather than full page reload to keep client-side
 *     state intact (cookies, scroll position)
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type State = 'idle' | 'pending' | 'denied' | 'error';

export function UseMyLocation() {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');

  function onClick() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('error');
      return;
    }
    setState('pending');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/user', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            }),
          });
          if (!res.ok) {
            setState('error');
            return;
          }
          // Re-render the route server-side; on the next render this
          // component is gone (source === 'user-saved') and the weather
          // widget refetches against the new coords.
          router.refresh();
        } catch {
          setState('error');
        }
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  if (state === 'denied') {
    return <span className="loc-msg loc-denied">geolocation denied</span>;
  }
  if (state === 'error') {
    return <span className="loc-msg loc-error">couldn’t get location</span>;
  }
  if (state === 'pending') {
    return <span className="loc-msg loc-pending">getting location…</span>;
  }

  return (
    <button type="button" className="loc-upgrade" onClick={onClick}>
      use precise location
    </button>
  );
}
