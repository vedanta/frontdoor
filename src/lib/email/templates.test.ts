import { describe, expect, it } from 'vitest';
import { renderKeyEmail } from './templates';

describe('renderKeyEmail', () => {
  const out = renderKeyEmail({
    key: 'abc123',
    url: 'https://frontdoor.app/?key=abc123',
  });

  it('has a subject', () => {
    expect(out.subject).toBe('Your frontdoor key');
  });

  it('text contains the URL and the key', () => {
    expect(out.text).toContain('https://frontdoor.app/?key=abc123');
    expect(out.text).toContain('abc123');
  });

  it('HTML contains the URL (anchor + visible)', () => {
    const occurrences = (out.html.match(/abc123/g) || []).length;
    // URL appears in href + visible code block at minimum
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('HTML body has the "Open your dashboard" CTA', () => {
    expect(out.html).toContain('Open your dashboard');
  });

  it('mentions the re-send-by-email idempotency hint', () => {
    expect(out.text.toLowerCase()).toContain('re-send the existing key');
  });
});
