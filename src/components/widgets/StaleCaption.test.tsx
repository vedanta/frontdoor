import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StaleCaption, formatStaleness } from './StaleCaption';

describe('formatStaleness (pure)', () => {
  it('returns null when fetchedAt is null', () => {
    expect(formatStaleness(null)).toBeNull();
  });

  it('returns null when fetchedAt is undefined (legacy cache value)', () => {
    expect(formatStaleness(undefined)).toBeNull();
  });

  it('returns null when fetchedAt is the same day as today', () => {
    expect(formatStaleness('2026-05-17', '2026-05-17')).toBeNull();
  });

  it('returns null when fetchedAt is somehow in the future', () => {
    expect(formatStaleness('2026-05-18', '2026-05-17')).toBeNull();
  });

  it('"yesterday" for 1 day old', () => {
    expect(formatStaleness('2026-05-16', '2026-05-17')).toBe('yesterday');
  });

  it('"N days ago" for 2-6 days old', () => {
    expect(formatStaleness('2026-05-15', '2026-05-17')).toBe('2 days ago');
    expect(formatStaleness('2026-05-14', '2026-05-17')).toBe('3 days ago');
    expect(formatStaleness('2026-05-11', '2026-05-17')).toBe('6 days ago');
  });

  it('"from <Month D>" for 7+ days old', () => {
    expect(formatStaleness('2026-05-10', '2026-05-17')).toBe('from May 10');
    expect(formatStaleness('2026-04-01', '2026-05-17')).toBe('from Apr 1');
    expect(formatStaleness('2025-12-25', '2026-05-17')).toBe('from Dec 25');
  });

  it('returns null on malformed input (graceful fallback)', () => {
    expect(formatStaleness('not-a-date', '2026-05-17')).toBeNull();
    expect(formatStaleness('2026-05-15', 'not-a-date')).toBeNull();
  });
});

describe('StaleCaption (component)', () => {
  it('renders nothing when content is today', () => {
    const { container } = render(<StaleCaption fetchedAt="2026-05-17" today="2026-05-17" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when fetchedAt is null (legacy)', () => {
    const { container } = render(<StaleCaption fetchedAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "─ yesterday" for 1 day old', () => {
    const { container } = render(<StaleCaption fetchedAt="2026-05-16" today="2026-05-17" />);
    expect(container.textContent).toBe('─ yesterday');
    expect(container.querySelector('.stale-caption')).toBeInTheDocument();
  });

  it('renders "─ 3 days ago" for 3 days old', () => {
    const { container } = render(<StaleCaption fetchedAt="2026-05-14" today="2026-05-17" />);
    expect(container.textContent).toBe('─ 3 days ago');
  });

  it('renders "─ from <date>" for 7+ days old', () => {
    const { container } = render(<StaleCaption fetchedAt="2026-05-01" today="2026-05-17" />);
    expect(container.textContent).toBe('─ from May 1');
  });

  it('has an aria-label for screen readers', () => {
    const { container } = render(<StaleCaption fetchedAt="2026-05-16" today="2026-05-17" />);
    expect(container.querySelector('.stale-caption')?.getAttribute('aria-label')).toBe(
      'content from yesterday',
    );
  });
});
