import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextWidget } from './Text';
import type { TextWidget as TextConfig } from '@/lib/config';

const quoteWidget: TextConfig = {
  type: 'text',
  title: 'Quote',
  color: 'amber',
  icon: '❝',
  span: 1,
  source: 'quote',
};

describe('TextWidget', () => {
  it('renders body, attribution, source label', () => {
    render(
      <TextWidget
        widget={quoteWidget}
        data={{
          body: 'Be kind.',
          attribution: 'Anon',
          sourceLabel: 'via zenquotes.io',
        }}
      />,
    );
    expect(screen.getByText('Be kind.')).toBeInTheDocument();
    // Attribution renders as "— Anon" — match the substring.
    expect(screen.getByText(/Anon/)).toBeInTheDocument();
    expect(screen.getByText('via zenquotes.io')).toBeInTheDocument();
  });

  it('wraps attribution in a link when `link` is provided', () => {
    render(
      <TextWidget
        widget={{
          type: 'text',
          title: 'Wikipedia',
          color: 'blue',
          icon: 'W',
          span: 1,
          source: 'wikipedia',
        }}
        data={{
          body: 'A historic event.',
          attribution: 'Some Article',
          link: 'https://en.wikipedia.org/wiki/Some_Article',
          sourceLabel: 'via Wikipedia',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Some Article' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Some_Article',
    );
  });

  it('appends "· Month D" to onthisday title', () => {
    render(
      <TextWidget
        widget={{
          type: 'text',
          title: 'On This Day',
          color: 'cyan',
          icon: '◷',
          span: 1,
          source: 'onthisday',
        }}
        data={{ body: '1900 — Something happened', attribution: 'On this day', sourceLabel: '' }}
      />,
    );
    expect(screen.getByText(/On This Day · /)).toBeInTheDocument();
  });

  it('renders "could not load" on null data', () => {
    render(<TextWidget widget={quoteWidget} data={null} />);
    expect(screen.getByText('could not load')).toBeInTheDocument();
  });

  it('does NOT render the stale caption when fetchedAt is today (#81b)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { container } = render(
      <TextWidget
        widget={quoteWidget}
        fetchedAt={today}
        data={{ body: 'Be kind.', attribution: 'Anon', sourceLabel: '' }}
      />,
    );
    expect(container.querySelector('.stale-caption')).not.toBeInTheDocument();
  });

  it('renders the stale caption when fetchedAt is older than today (#81b)', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { container } = render(
      <TextWidget
        widget={quoteWidget}
        fetchedAt={yesterday}
        data={{ body: 'Be kind.', attribution: 'Anon', sourceLabel: '' }}
      />,
    );
    expect(container.querySelector('.stale-caption')?.textContent).toBe('─ yesterday');
  });

  it('does NOT render the stale caption when fetchedAt is null (legacy / unknown)', () => {
    const { container } = render(
      <TextWidget
        widget={quoteWidget}
        fetchedAt={null}
        data={{ body: 'Be kind.', attribution: 'Anon', sourceLabel: '' }}
      />,
    );
    expect(container.querySelector('.stale-caption')).not.toBeInTheDocument();
  });
});
