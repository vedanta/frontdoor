import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './server';

/**
 * Sanity test for the MSW wiring. Demonstrates two patterns the fetcher tests
 * (#6–#9) will use:
 *   1. Calling through the default handlers in handlers.ts.
 *   2. Adding a one-off `server.use(...)` handler scoped to a single test.
 */
describe('MSW', () => {
  it('serves a response from the default handlers', async () => {
    const res = await fetch('https://example.invalid/ping');
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('lets a test override a handler', async () => {
    server.use(http.get('https://example.invalid/ping', () => HttpResponse.json({ ok: false })));
    const res = await fetch('https://example.invalid/ping');
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
