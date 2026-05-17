/**
 * Exception-only stale caption (#81b) — surfaces "the content you're looking
 * at is from <date>" ONLY when the widget's data was served from a previous
 * day's cache. Hidden entirely when content is today's.
 *
 * Per #76 / design/02 — trust > evaluation: no continuous freshness measurement,
 * no "5h ago" labels. The caption is exception-flagging, not status-tracking.
 *
 * Format (chosen 2026-05-17):
 *   1 day old:     "── yesterday"
 *   2-6 days old:  "── 2 days ago"   ... etc
 *   7+ days old:   "── from May 10"  (falls back to absolute date)
 *
 * Rendered as a single dim line, prefixed with `─` so it reads as metadata
 * rather than body text. Hidden when fetchedAt is null (legacy values from
 * before #81b's cache envelope) — "unknown date" gets no caption.
 */
import { formatDate } from '@/lib/kv/keys';

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Returns the relative-time string, or `null` if the content is today's
 * (or `fetchedAt` is null/invalid — same behavior, no caption).
 */
export function formatStaleness(
  fetchedAt: string | null | undefined,
  today: string = formatDate(),
): string | null {
  if (!fetchedAt) return null;

  // ISO YYYY-MM-DD comparison via Date — both are in UTC so this is safe.
  const fetched = new Date(fetchedAt);
  const now = new Date(today);
  if (isNaN(fetched.getTime()) || isNaN(now.getTime())) return null;

  const diffMs = now.getTime() - fetched.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days <= 0) return null; // today's content or somehow in the future
  if (days === 1) return 'yesterday';
  if (days <= 6) return `${days} days ago`;

  // 7+ days: absolute date "from May 10"
  return `from ${MONTH_ABBR[fetched.getUTCMonth()]} ${fetched.getUTCDate()}`;
}

type Props = {
  fetchedAt: string | null | undefined;
  /** Override "today" — primarily for testing. */
  today?: string;
};

export function StaleCaption({ fetchedAt, today }: Props) {
  const text = formatStaleness(fetchedAt, today);
  if (text === null) return null;
  return (
    <div className="stale-caption" aria-label={`content from ${text}`}>
      ─ {text}
    </div>
  );
}
