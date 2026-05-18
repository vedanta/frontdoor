#!/usr/bin/env node
/**
 * Seed a known test user into the KV — bypass signup, no email sent.
 *
 * Run via: `pnpm seed:test-user`
 *
 * Default args:
 *   --email     dev@frontdoor.app
 *   --key       fd_deadbeefdeadbeefdeadbeefdeadbeef   (#72 — fd_ + 32 hex)
 *   --slug      deadbeef                              (8 hex chars)
 *   --userId    u_dev_local
 *   --name      dev user                              (#69 — display name)
 *   --timezone  America/New_York                      (#69 — IANA tz)
 *
 * Also writes a long-TTL bootstrap token (#73) at
 *   `bootstrap:fdb_deadbeefdeadbeefdeadbeefdeadbeef`
 * so E2E can test the new `?bootstrap=` flow with a known token. The seed
 * uses TTL=24h (vs prod's 5min) so it lives long enough for a test session.
 * Single-use semantics still apply — each E2E run consumes it; global-setup
 * re-runs the seed before every session.
 *
 * Idempotent. Re-running with the same args overwrites cleanly. The script
 * also exports `seedUser(...)` so Playwright fixtures (e2e/global-setup.ts)
 * can call it directly without spawning a subprocess.
 *
 * NOT a production code path. Lives under scripts/, never imported by
 * src/app/* or middleware. Lets you `curl /?key=<that key>` (or visit
 * http://localhost:3000/?key=…) and immediately land at /fd/{slug}.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

// Load .env.local up front — tsx doesn't auto-load it (only Next.js does).
// Idempotent: existing process.env values win.
(() => {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes — `vercel env pull` quotes its output.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
})();

import {
  apiKeyKey,
  bootstrapKey,
  configKey,
  emailKey,
  getRedis,
  slugKey,
  USERS_SET,
  userKey,
  type BootstrapRecord,
  type UserRecord,
} from '../src/lib/kv';
import { DEFAULT_CONFIG } from '../src/lib/config';

const DEFAULTS = {
  email: 'dev@frontdoor.app',
  // `fd_` + 32 hex chars — matches signup-minted format (mintIds, #72).
  // `deadbeef` x4 is a recognizable "definitely a test value" pattern.
  apiKey: 'fd_deadbeefdeadbeefdeadbeefdeadbeef',
  // 8 hex chars — same shape as signup-minted slugs
  slug: 'deadbeef',
  userId: 'u_dev_local',
  // Optional UserRecord fields (#69). Seeded so /api/user E2E tests can
  // assert on specific values; harmless to existing E2E that ignores them.
  name: 'dev user',
  timezone: 'America/New_York',
  // #73 — bootstrap token seeded with long TTL so E2E can exercise
  // ?bootstrap= flow with a known value. Single-use semantics still apply;
  // global-setup re-runs the seed each session.
  bootstrapToken: 'fdb_deadbeefdeadbeefdeadbeefdeadbeef',
};

/** TTL for the seeded bootstrap (#73) — 24h, vs prod's 5 min. */
const SEED_BOOTSTRAP_TTL_SEC = 60 * 60 * 24;

export type SeedArgs = {
  email?: string;
  apiKey?: string;
  slug?: string;
  userId?: string;
  name?: string;
  timezone?: string;
  bootstrapToken?: string;
};

export type SeededUser = UserRecord & { userId: string; bootstrapToken: string };

/**
 * Write the user + key + slug + config + users-set entries.
 * Idempotent — re-running with the same args is a no-op-ish (set overwrites
 * the same values; sadd is a no-op when already present).
 */
export async function seedUser(args: SeedArgs = {}): Promise<SeededUser> {
  const email = (args.email ?? DEFAULTS.email).toLowerCase();
  const apiKey = args.apiKey ?? DEFAULTS.apiKey;
  const slug = args.slug ?? DEFAULTS.slug;
  const userId = args.userId ?? DEFAULTS.userId;
  const name = args.name ?? DEFAULTS.name;
  const timezone = args.timezone ?? DEFAULTS.timezone;
  const bootstrapToken = args.bootstrapToken ?? DEFAULTS.bootstrapToken;

  const redis = getRedis();
  const user: UserRecord = {
    email,
    apiKey,
    slug,
    name,
    timezone,
    createdAt: new Date().toISOString(),
  };
  const bootstrap: BootstrapRecord = {
    userId,
    slug,
    exp: Date.now() + SEED_BOOTSTRAP_TTL_SEC * 1000,
  };

  await Promise.all([
    redis.set(apiKeyKey(apiKey), userId),
    redis.set(slugKey(slug), userId),
    redis.set(emailKey(email), userId),
    redis.set(userKey(userId), user),
    redis.set(configKey(userId), DEFAULT_CONFIG),
    redis.sadd(USERS_SET, userId),
    redis.set(bootstrapKey(bootstrapToken), bootstrap, { ex: SEED_BOOTSTRAP_TTL_SEC }),
  ]);

  return { ...user, userId, bootstrapToken };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      key: { type: 'string' },
      slug: { type: 'string' },
      userId: { type: 'string' },
      name: { type: 'string' },
      timezone: { type: 'string' },
      bootstrap: { type: 'string' },
    },
  });

  const seeded = await seedUser({
    email: values.email,
    apiKey: values.key,
    slug: values.slug,
    userId: values.userId,
    name: values.name,
    timezone: values.timezone,
    bootstrapToken: values.bootstrap,
  });

  console.log('✓ seeded test user');
  console.log(`  email     : ${seeded.email}`);
  console.log(`  userId    : ${seeded.userId}`);
  console.log(`  slug      : ${seeded.slug}`);
  console.log(`  apiKey    : ${seeded.apiKey}`);
  console.log(`  name      : ${seeded.name}`);
  console.log(`  timezone  : ${seeded.timezone}`);
  console.log(`  bootstrap : ${seeded.bootstrapToken}`);
  console.log('');
  console.log('open the dashboard:');
  console.log(`  http://localhost:3000/?bootstrap=${seeded.bootstrapToken}   (preferred, #73)`);
  console.log(`  http://localhost:3000/?key=${seeded.apiKey}   (legacy, 60-day window)`);
}

// Only run main() when invoked as a script (not when imported from a test).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error('✗ seed failed:', err);
    process.exit(1);
  });
}
