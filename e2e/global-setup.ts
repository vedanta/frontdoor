/**
 * Playwright global setup — runs once before any test.
 *
 * Loads .env.local manually (Playwright's loader doesn't), then runs the
 * `pnpm seed:test-user` script as a subprocess. We use the subprocess form
 * rather than importing scripts/seed-test-user directly because Playwright's
 * TypeScript loader resolves it as CJS while the file targets ESM (`import.meta`
 * usage in the script's `main()` guard).
 *
 * If KV credentials aren't present, we skip with a notice; the auth + dashboard
 * specs will `test.skip(!hasKV, ...)` themselves.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvLocal(): void {
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
}

export default async function globalSetup(): Promise<void> {
  loadEnvLocal();

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.log(
      '[e2e] KV credentials missing — skipping seed. Auth/dashboard tests will be skipped.',
    );
    return;
  }

  try {
    execSync('pnpm seed:test-user', { stdio: 'inherit' });
  } catch (err) {
    console.error('[e2e] seed failed:', err);
    throw err;
  }
}
