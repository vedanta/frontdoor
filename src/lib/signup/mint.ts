/**
 * Pure ID-minting helpers for signup.
 *
 * - `apiKey`: 32 hex chars (UUID v4, dashes stripped) → ~122 bits of entropy.
 *   Used as the Bearer token / `?key=` query parameter.
 * - `userId`: full UUID v4 — internal account id.
 * - `slug`: 8 hex chars — non-secret per-user route segment for `/fd/[slug]`.
 *   ~32 bits — fine for the user counts MVP will see; collide-resistant in
 *   practice (a fresh slug is re-rolled on collision in the signup endpoint,
 *   though at MVP scale it will essentially never happen).
 */

export type MintedIds = {
  apiKey: string;
  userId: string;
  slug: string;
};

export function mintIds(): MintedIds {
  return {
    apiKey: crypto.randomUUID().replace(/-/g, ''),
    userId: crypto.randomUUID(),
    slug: crypto.randomUUID().slice(0, 8),
  };
}

/** Builds the bootstrap URL the email links to. */
export function buildKeyUrl(key: string, origin: string): string {
  return `${origin}/?key=${key}`;
}
