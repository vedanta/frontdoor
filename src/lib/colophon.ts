/**
 * Colophon helpers — pure functions feeding the dashboard StatusBar (#67).
 *
 * Everything here is deterministic from a `Date` input; no fetches, no
 * environment dependencies except `process.env.NODE_ENV` for the dev/prod
 * fork in `getVersion`. Used server-side from `src/app/fd/[slug]/page.tsx`.
 *
 * Convention: all date math is in UTC. The dashboard's cache keys are
 * UTC-day-stamped (e.g. `cache:nasa-apod:2026-05-17`); using UTC here keeps
 * the colophon's "day 137" consistent with the staleness comparison even
 * across the overnight UTC boundary.
 */
import pkg from '../../package.json';

const MS_PER_DAY = 86_400_000;

// ── Version ─────────────────────────────────────────────────────────────

export type VersionLabel = { label: string; href: string | null };

/**
 * Build-time version for the statusbar.
 *
 * - In production: `v{package.json#version}` linked to the GitHub Release
 *   page for that tag. The tag-gate (ops/vercel-ignore-build.sh) guarantees
 *   prod deploys are on a tagged commit, so the link target exists.
 * - In any other mode (dev, test): literal `dev`, no link.
 *
 * Version sync is on the release author — bump package.json#version to match
 * the intended tag before pushing. A follow-up (#78) will automate this in
 * the release skill.
 */
export function getVersion(): VersionLabel {
  if (process.env.NODE_ENV !== 'production') {
    return { label: 'dev', href: null };
  }
  const v = `v${pkg.version}`;
  return { label: v, href: `https://github.com/vedanta/frontdoor/releases/tag/${v}` };
}

// ── Calendar (day-of-year + ISO 8601 week) ──────────────────────────────

/** Ordinal day of year (1-366). Jan 1 = 1. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0); // Dec 31 of previous year
  return Math.floor((date.getTime() - start) / MS_PER_DAY);
}

/**
 * ISO 8601 week number (1-53). Week 1 is the week containing the year's
 * first Thursday. Weeks start on Monday.
 *
 * Reference algorithm: https://en.wikipedia.org/wiki/ISO_week_date
 */
export function weekOfYear(date: Date): number {
  const target = new Date(date.getTime());
  // ISO weekday: Mon=0..Sun=6 (UTC). JS `getUTCDay` returns Sun=0..Sat=6.
  const isoDay = (target.getUTCDay() + 6) % 7;
  // Shift target to the Thursday of its ISO week.
  target.setUTCDate(target.getUTCDate() - isoDay + 3);
  const thursday = target.getTime();
  // Jan 4 is always in ISO week 1.
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstIsoDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIsoDay + 3);
  return 1 + Math.round((thursday - firstThursday.getTime()) / (7 * MS_PER_DAY));
}

// ── Moon phase ──────────────────────────────────────────────────────────

export type MoonPhase = { emoji: string; name: string };

const PHASES: readonly MoonPhase[] = [
  { emoji: '🌑', name: 'new moon' },
  { emoji: '🌒', name: 'waxing crescent' },
  { emoji: '🌓', name: 'first quarter' },
  { emoji: '🌔', name: 'waxing gibbous' },
  { emoji: '🌕', name: 'full moon' },
  { emoji: '🌖', name: 'waning gibbous' },
  { emoji: '🌗', name: 'last quarter' },
  { emoji: '🌘', name: 'waning crescent' },
];

// Known new moon: 2000-01-06 18:14 UTC. Synodic month: 29.530588853 days.
const NEW_MOON_REF_MS = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_MS = 29.530588853 * MS_PER_DAY;

/**
 * 8-phase moon for a given date. Each phase is centred on its exact moment
 * (e.g. 🌒 waxing crescent spans 1/16 to 3/16 of the synodic cycle), so
 * the named-phase emojis appear at their conventional times rather than
 * lagging by half a bucket.
 */
export function moonPhase(date: Date): MoonPhase {
  const elapsed = date.getTime() - NEW_MOON_REF_MS;
  // phase ∈ [0, 1): 0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter
  let phase = (elapsed % SYNODIC_MS) / SYNODIC_MS;
  if (phase < 0) phase += 1;
  // Shift by half a bucket (1/16) so each phase emoji is centred on its moment.
  const idx = Math.floor(((phase + 1 / 16) % 1) * 8);
  return PHASES[idx];
}

// ── Time formatter ──────────────────────────────────────────────────────

/**
 * Extract HH:MM from a weather API datetime like `'2026-05-15T20:09'`.
 * Used for both sunrise and sunset in the statusbar. Returns `null` if the
 * input doesn't match — caller decides whether to omit that chunk entirely.
 */
export function extractHhmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

// ── Aggregate-stale helper ──────────────────────────────────────────────

/**
 * Count of widgets whose data was served from a previous-day cache. Mirrors
 * the per-widget staleness check in `StaleCaption.formatStaleness` (#81).
 * `fetchedAt` is the UTC date string (YYYY-MM-DD) the cache wrapper stamps.
 */
export function countStaleWidgets(
  fetchedAts: ReadonlyArray<string | null>,
  todayUtc: string,
): number {
  return fetchedAts.filter((d) => d !== null && d < todayUtc).length;
}
