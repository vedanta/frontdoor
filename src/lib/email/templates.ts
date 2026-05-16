/**
 * Email templates. Hand-rolled HTML (no react-email dep for one transactional
 * message). The HTML keeps email-safe styling: inline styles, table-friendly
 * widths, no external CSS.
 */

export type KeyEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderKeyEmail({ key, url }: { key: string; url: string }): KeyEmail {
  const subject = 'Your frontdoor key';

  const text = [
    'Your frontdoor key is ready.',
    '',
    'Open this link to set up your browser:',
    url,
    '',
    "Keep the key safe — it's your login. If you lose it, sign up with the same",
    'email at /api/keys and we will re-send the existing key.',
    '',
    `Key: ${key}`,
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:40px auto;padding:24px;color:#1a1a1a;line-height:1.55;">
    <h1 style="font-weight:300;letter-spacing:0.05em;font-size:22px;margin:0 0 8px 0;">frontdoor</h1>
    <p style="color:#666;margin:0 0 24px 0;">Your key is ready.</p>
    <p style="margin:0 0 24px 0;">
      <a href="${url}"
         style="display:inline-block;padding:10px 18px;background:#0a0e17;color:#4ecdc4;text-decoration:none;border-radius:6px;font-family:'IBM Plex Mono',monospace;font-size:13px;letter-spacing:1px;">
        Open your dashboard
      </a>
    </p>
    <p style="font-size:12px;color:#666;margin:0 0 24px 0;">
      Or paste this link:<br>
      <code style="color:#444;word-break:break-all;">${url}</code>
    </p>
    <p style="font-size:12px;color:#999;margin:40px 0 0 0;border-top:1px solid #eee;padding-top:12px;">
      Keep this email — your key is your login. If you lose it, sign up with the same
      email again and we'll re-send the existing key.
    </p>
  </body>
</html>`;

  return { subject, html, text };
}
