/**
 * The data layer's canonical result envelope — every fetcher returns one.
 *
 * `fresh: true` means the value came from a live upstream call this request;
 * `fresh: false` means it came from KV cache (the common, fast path).
 *
 * `ok: false` is a structured "could not load" — never an exception. Widgets
 * render a quiet placeholder; the page still paints (per docs/architecture.md §6
 * → Resilience).
 */
export type FetchResult<T> = { ok: true; data: T; fresh: boolean } | { ok: false; reason: string };
