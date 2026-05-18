/**
 * Pure ID-minting helpers for signup.
 *
 * - `apiKey`: `fd_` + 32 hex chars (UUID v4, dashes stripped) → ~122 bits of
 *   entropy (the prefix is fixed, doesn't reduce entropy). Used as the Bearer
 *   token / `?key=` query parameter. Prefix follows industry convention
 *   (Stripe `sk_live_`, Resend `re_`, GitHub `gh_pat_`) so frontdoor keys
 *   are identifiable as such in logs, leaks, or shared contexts (#72).
 * - `userId`: full UUID v4 — internal account id.
 * - `slug`: 8 hex chars — non-secret per-user route segment for `/fd/[slug]`.
 *   ~32 bits — fine for the user counts MVP will see; collide-resistant in
 *   practice (a fresh slug is re-rolled on collision in the signup endpoint,
 *   though at MVP scale it will essentially never happen).
 *
 * Backwards-compat: the auth gate (middleware, getSessionFromBearer) does
 * NOT validate the prefix — keys are opaque tokens looked up in KV. Existing
 * pre-prefix keys keep working forever. The prefix is mint-side only.
 */

/** Prefix on all newly-minted apiKeys (#72). Pre-existing keys lack this. */
export const API_KEY_PREFIX = 'fd_';

export type MintedIds = {
  apiKey: string;
  userId: string;
  slug: string;
};

export function mintIds(): MintedIds {
  return {
    apiKey: `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`,
    userId: crypto.randomUUID(),
    slug: crypto.randomUUID().slice(0, 8),
  };
}

/** Builds the bootstrap URL the email links to. */
export function buildKeyUrl(key: string, origin: string): string {
  return `${origin}/?key=${key}`;
}
