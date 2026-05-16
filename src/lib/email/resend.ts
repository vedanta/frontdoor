/**
 * Resend client wrapper.
 *
 * Reads `RESEND_API_KEY` from env. The sender ("from" address) defaults to
 * `frontdoor <onboarding@resend.dev>` — Resend's test sender that doesn't
 * require domain verification. For production-quality delivery (sending to
 * arbitrary recipients), set `RESEND_FROM_EMAIL` to a verified-domain address
 * — `noreply@frontdoor.app` or similar. Setup is tracked in #26.
 *
 * Lazy singleton — same pattern as the KV client, so env can be stubbed in
 * tests before the client is constructed.
 */
import { Resend } from 'resend';

const DEFAULT_FROM = 'frontdoor <onboarding@resend.dev>';

let _resend: Resend | undefined;

export function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Resend: RESEND_API_KEY is not set. Sign up at https://resend.com → API Keys; add it to .env.local (see .env.example).',
      );
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

/** Test-only: clears the cached singleton. */
export function resetResend(): void {
  _resend = undefined;
}

/** The "from" address. Verified-domain in prod (#26); test sender otherwise. */
export function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
}
