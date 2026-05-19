#!/usr/bin/env node
/**
 * One-shot migration: strip the default NYC lat/lon from any user's weather
 * widget so layered resolution (#105) can fill in via UserRecord → Vercel
 * edge geo → fallback.
 *
 * The default at the time of #105 was `lat: 40.71, lon: -74.01` (Manhattan).
 * Configs that have EXACTLY those values almost certainly inherited them
 * from `DEFAULT_CONFIG` and didn't explicitly set NYC. Stripping is safe:
 * worst case, a user who genuinely chose NYC needs to re-set via the
 * `<UseMyLocation/>` upgrade link or a direct PUT.
 *
 * Idempotent. Re-running on a clean KV state is a no-op.
 *
 *   pnpm tsx scripts/migrate-strip-default-location.ts          # dry-run
 *   pnpm tsx scripts/migrate-strip-default-location.ts --apply  # actually write
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

// Load .env.local up front — tsx doesn't auto-load it.
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
})();

import { configKey, getRedis, USERS_SET } from '../src/lib/kv';
import { DashboardConfigSchema } from '../src/lib/config';

const DEFAULT_LAT = 40.71;
const DEFAULT_LON = -74.01;

type RunOpts = { apply: boolean };

async function run({ apply }: RunOpts): Promise<void> {
  const redis = getRedis();
  const userIds = (await redis.smembers(USERS_SET)) as string[];
  if (!userIds.length) {
    console.log('No users in KV; nothing to migrate.');
    return;
  }

  console.log(`Found ${userIds.length} user(s). Mode: ${apply ? 'APPLY' : 'dry-run'}`);
  console.log('');

  let touched = 0;
  let skipped = 0;
  let invalid = 0;

  for (const userId of userIds) {
    const raw = await redis.get<unknown>(configKey(userId));
    if (!raw) {
      console.log(`  ${userId}  ─  no config:{userId} key; skipping`);
      skipped++;
      continue;
    }
    const parsed = DashboardConfigSchema.safeParse(raw);
    if (!parsed.success) {
      console.log(`  ${userId}  ✗  config fails schema; skipping`);
      invalid++;
      continue;
    }
    const config = parsed.data;

    // Walk widgets; for each `type: weather`, strip lat/lon if they match
    // the default. Capture whether anything was changed.
    let changed = false;
    const newSections = config.sections.map((section) => ({
      ...section,
      widgets: section.widgets.map((w) => {
        if (w.type !== 'weather') return w;
        if (w.lat === DEFAULT_LAT && w.lon === DEFAULT_LON) {
          changed = true;
          // Use object spread + delete pattern to drop the keys cleanly.
          const stripped: typeof w = { ...w };
          delete stripped.lat;
          delete stripped.lon;
          return stripped;
        }
        return w;
      }),
    }));

    if (!changed) {
      console.log(`  ${userId}  ─  no default-NYC weather widget; skipping`);
      skipped++;
      continue;
    }

    const newConfig = { ...config, sections: newSections };

    // Re-validate post-strip — must still pass (lat/lon are now optional).
    const reparsed = DashboardConfigSchema.safeParse(newConfig);
    if (!reparsed.success) {
      console.log(`  ${userId}  ✗  post-strip config fails schema; not writing`);
      invalid++;
      continue;
    }

    if (apply) {
      await redis.set(configKey(userId), newConfig);
      console.log(`  ${userId}  ✓  stripped lat/lon, wrote config`);
    } else {
      console.log(`  ${userId}  ✓  WOULD strip lat/lon (dry-run; pass --apply to write)`);
    }
    touched++;
  }

  console.log('');
  console.log(`Done. touched=${touched} skipped=${skipped} invalid=${invalid}`);
  if (!apply && touched > 0) {
    console.log('Pass --apply to actually write the changes.');
  }
}

const { values } = parseArgs({
  options: { apply: { type: 'boolean', default: false } },
});

run({ apply: values.apply ?? false }).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
