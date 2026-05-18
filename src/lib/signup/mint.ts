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
 * Backwards-compat: the auth gate (proxy, getSessionFromBearer) does NOT
 * validate the prefix — keys are opaque tokens looked up in KV. Existing
 * pre-prefix keys keep working forever. The prefix is mint-side only.
 */

/** Prefix on all newly-minted apiKeys (#72). Pre-existing keys lack this. */
export const API_KEY_PREFIX = 'fd_';

/**
 * Prefix on bootstrap tokens (#73). Distinct from `fd_` apiKeys: different
 * lifecycle, different threat model (ephemeral, 5-min TTL, single-use → a
 * leaked `fdb_` is mostly harmless after expiry; a leaked `fd_` needs urgent
 * rotation). Distinct prefix = instant visual signal in logs.
 */
export const BOOTSTRAP_TOKEN_PREFIX = 'fdb_';

/**
 * Default TTL for bootstrap tokens (#73). Matches "click the link from your
 * email" window — Resend delivery is sub-minute typically, 5 minutes is
 * conservative. Enforced two ways: Redis `EX` at write time + `exp` field
 * inside the value (defensive double-check at read time).
 */
export const BOOTSTRAP_TOKEN_TTL_SEC = 300;

export type MintedIds = {
  apiKey: string;
  userId: string;
  slug: string;
  /** One-time bootstrap token (#73). Wraps the identity for email-link auth. */
  bootstrapToken: string;
};

export function mintIds(): MintedIds {
  return {
    apiKey: `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`,
    userId: crypto.randomUUID(),
    slug: crypto.randomUUID().slice(0, 8),
    bootstrapToken: mintBootstrapToken(),
  };
}

/**
 * Mint a fresh bootstrap token alone — used on the known-email re-signup path,
 * where we re-issue a new ephemeral token but keep the existing long-lived
 * apiKey + identity.
 */
export function mintBootstrapToken(): string {
  return `${BOOTSTRAP_TOKEN_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Build the bootstrap URL the email links to (#73). The bootstrap token is
 * single-use + short-lived; the long-lived apiKey is no longer in the URL.
 */
export function buildBootstrapUrl(token: string, origin: string): string {
  return `${origin}/?bootstrap=${token}`;
}

/**
 * @deprecated Use `buildBootstrapUrl` (#73). Kept for the 60-day backwards-compat
 * window during which the `?key=` proxy path is still served.
 */
export function buildKeyUrl(key: string, origin: string): string {
  return `${origin}/?key=${key}`;
}
