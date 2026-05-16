/**
 * High-level email senders the app calls. Wraps the Resend client + templates
 * so callers (e.g. POST /api/keys) don't import either directly.
 */
import { fromAddress, getResend } from './resend';
import { renderKeyEmail } from './templates';

export type SendResult = { ok: true; id?: string } | { ok: false; reason: string };

export async function sendKeyEmail(args: {
  to: string;
  key: string;
  url: string;
}): Promise<SendResult> {
  const { subject, html, text } = renderKeyEmail({ key: args.key, url: args.url });
  try {
    const res = await getResend().emails.send({
      from: fromAddress(),
      to: args.to,
      subject,
      html,
      text,
    });
    if (res.error) {
      return { ok: false, reason: res.error.message };
    }
    return { ok: true, id: res.data?.id };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'send failed' };
  }
}
