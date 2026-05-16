/**
 * Thin wrapper around fetch with the conventions every upstream call needs:
 *   - `User-Agent: frontdoor/1.0` (some APIs reject the default UA)
 *   - AbortSignal timeout (default 10s — per design/04-data-sources.md)
 *   - returns a discriminated result; never throws on network/parse failures
 *
 * Source fetchers compose this with `withResilience` (./resilience) so the
 * caller sees a single consistent envelope.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'frontdoor/1.0';

export type UpstreamFetchOptions = {
  /** Per-request timeout. Default 10s. */
  timeoutMs?: number;
  /** Extra headers; User-Agent is set automatically if not provided. */
  headers?: HeadersInit;
  /** How to parse the response body. Default `json`. */
  parseAs?: 'json' | 'text' | 'arrayBuffer';
};

export type UpstreamResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; reason: string; status?: number };

export async function fetchUpstream<T = unknown>(
  url: string,
  options: UpstreamFetchOptions = {},
): Promise<UpstreamResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, parseAs = 'json' } = options;

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', DEFAULT_USER_AGENT);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, reason: `http ${res.status}`, status: res.status };
    }

    let data: T;
    if (parseAs === 'json') {
      data = (await res.json()) as T;
    } else if (parseAs === 'text') {
      data = (await res.text()) as unknown as T;
    } else {
      data = (await res.arrayBuffer()) as unknown as T;
    }

    return { ok: true, data, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'fetch error' };
  }
}
