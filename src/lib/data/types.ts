/**
 * The data layer's canonical result envelope — every fetcher returns one.
 *
 * `fresh: true` means the value came from a live upstream call this request;
 * `fresh: false` means it came from KV cache (the common, fast path).
 *
 * `fetchedAt` (optional, ISO date `YYYY-MM-DD`) — when the value was originally
 * fetched. Set by `withResilience`, not by individual fetchers. Used by widget
 * renderers for exception-only stale flagging (#81): when content was served
 * from a previous-day cache (today's fetch failed), the UI shows a small
 * "yesterday" / "from May 10" caption. When content is today's, the caption
 * is hidden — no continuous freshness measurement.
 *
 * Older cached values written before this field existed will have a null /
 * missing fetchedAt; the UI treats that as "unknown" and shows no caption.
 * Legacy values self-heal within ~26h as TTLs expire.
 *
 * `ok: false` is a structured "could not load" — never an exception. Widgets
 * render a quiet placeholder; the page still paints (per docs/architecture.md §6
 * → Resilience).
 */
export type FetchResult<T> =
  | { ok: true; data: T; fresh: boolean; fetchedAt?: string }
  | { ok: false; reason: string };
