#!/usr/bin/env node
/**
 * Seed a known test user into the KV — bypass signup, no email sent.
 *
 * Run via: `pnpm seed:test-user`
 *
 * Default args:
 *   --email dev@frontdoor.app
 *   --key   dev0000000000000000000000000000ab   (32 hex chars; remember/share)
 *   --slug  devdev01                            (8 hex chars)
 *
 * Idempotent. Re-running with the same args overwrites cleanly. The script
 * also exports `seedUser(...)` so #27's Playwright fixtures can call it
 * directly without spawning a subprocess.
 *
 * NOT a production code path. Lives under scripts/, never imported by
 * src/app/* or middleware. Lets you `curl /?key=<that key>` (or visit
 * http://localhost:3000/?key=…) and immediately land at /d/{slug}.
 */
import { parseArgs } from 'node:util';
import {
  apiKeyKey,
  configKey,
  emailKey,
  getRedis,
  slugKey,
  USERS_SET,
  userKey,
  type UserRecord,
} from '../src/lib/kv';
import { DEFAULT_CONFIG } from '../src/lib/config';

const DEFAULTS = {
  email: 'dev@frontdoor.app',
  // 32 hex chars — matches signup-minted format (mintIds). `deadbeef` x4 is
  // a recognizable "definitely a test value" pattern.
  apiKey: 'deadbeefdeadbeefdeadbeefdeadbeef',
  // 8 hex chars — same shape as signup-minted slugs
  slug: 'deadbeef',
  userId: 'u_dev_local',
};

export type SeedArgs = {
  email?: string;
  apiKey?: string;
  slug?: string;
  userId?: string;
};

export type SeededUser = UserRecord & { userId: string };

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

  const redis = getRedis();
  const user: UserRecord = {
    email,
    apiKey,
    slug,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    redis.set(apiKeyKey(apiKey), userId),
    redis.set(slugKey(slug), userId),
    redis.set(emailKey(email), userId),
    redis.set(userKey(userId), user),
    redis.set(configKey(userId), DEFAULT_CONFIG),
    redis.sadd(USERS_SET, userId),
  ]);

  return { ...user, userId };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      key: { type: 'string' },
      slug: { type: 'string' },
      userId: { type: 'string' },
    },
  });

  const seeded = await seedUser({
    email: values.email,
    apiKey: values.key,
    slug: values.slug,
    userId: values.userId,
  });

  console.log('✓ seeded test user');
  console.log(`  email   : ${seeded.email}`);
  console.log(`  userId  : ${seeded.userId}`);
  console.log(`  slug    : ${seeded.slug}`);
  console.log(`  apiKey  : ${seeded.apiKey}`);
  console.log('');
  console.log('open the dashboard:');
  console.log(`  http://localhost:3000/?key=${seeded.apiKey}`);
}

// Only run main() when invoked as a script (not when imported from a test).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error('✗ seed failed:', err);
    process.exit(1);
  });
}
