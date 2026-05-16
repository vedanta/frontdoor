/**
 * Deterministic, order-stable hash of a `headlines` widget's feed set + count.
 * Used as the cache-key parameter — so two widgets with the same feed list
 * (in any order) and the same count hit the same KV entry.
 *
 * SHA-256, first 8 hex chars (~32 bits, ample for our scale).
 */

export type Feed = { url: string; name: string };

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function feedSetHash(feeds: Feed[], count: number): Promise<string> {
  const urls = feeds.map((f) => f.url).sort();
  const input = JSON.stringify({ feeds: urls, count });
  return (await sha256(input)).slice(0, 8);
}
