import { expect, test } from '@playwright/test';

/**
 * Signup endpoint E2E — POST /api/keys.
 *
 * We can't fully verify the email-sending side here (would need a real
 * inbox), so this asserts the HTTP contract: 202 on accepted payload,
 * 400 on bad input. The end-to-end email-receive case is a manual
 * launch-checklist step (#26 / docs/launch-checklist.md).
 *
 * Requires RESEND_API_KEY (the route calls sendKeyEmail). Skipped without it.
 */
const hasResend = !!process.env.RESEND_API_KEY;
test.skip(!hasResend, 'RESEND_API_KEY not configured');

test('POST /api/keys with a valid email → 202', async ({ request }) => {
  const res = await request.post('/api/keys', {
    data: { email: 'e2e-noreply@frontdoor.app' },
  });
  expect(res.status()).toBe(202);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe('check your email');
});

test('POST /api/keys with invalid email → 400', async ({ request }) => {
  const res = await request.post('/api/keys', {
    data: { email: 'not-an-email' },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/keys with malformed JSON → 400', async ({ request }) => {
  const res = await request.post('/api/keys', {
    headers: { 'content-type': 'application/json' },
    data: 'not-json',
  });
  expect(res.status()).toBe(400);
});
