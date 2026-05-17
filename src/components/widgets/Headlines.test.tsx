import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeadlinesWidget } from './Headlines';
import type { HeadlinesWidget as HeadlinesConfig } from '@/lib/config';

const widget: HeadlinesConfig = {
  type: 'headlines',
  title: 'Top Stories',
  color: 'amber',
  icon: '▤',
  span: 1,
  count: 3,
  feeds: [
    { url: 'https://rss.nytimes.com/x.xml', name: 'NYT' },
    { url: 'https://feeds.bbci.co.uk/x.xml', name: 'BBC' },
  ],
};

describe('HeadlinesWidget', () => {
  it('renders each headline as a link with source label', () => {
    render(
      <HeadlinesWidget
        widget={widget}
        data={[
          { title: 'First story', link: 'https://nytimes.com/a', source: 'NYT' },
          { title: 'Second story', link: 'https://bbc.co.uk/b', source: 'BBC' },
        ]}
      />,
    );
    expect(screen.getByText('First story')).toBeInTheDocument();
    expect(screen.getByText('NYT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /First story/ })).toHaveAttribute(
      'href',
      'https://nytimes.com/a',
    );
  });

  it('renders the via … footer from feed names', () => {
    render(<HeadlinesWidget widget={widget} data={[]} />);
    expect(screen.getByText('via NYT, BBC')).toBeInTheDocument();
  });

  it('renders "could not load" when data is null', () => {
    render(<HeadlinesWidget widget={widget} data={null} />);
    expect(screen.getByText('could not load')).toBeInTheDocument();
  });

  it('does NOT render stale caption when fetchedAt is today (#81c)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { container } = render(<HeadlinesWidget widget={widget} data={[]} fetchedAt={today} />);
    expect(container.querySelector('.stale-caption')).not.toBeInTheDocument();
  });

  it('renders stale caption when fetchedAt is older than today (#81c)', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { container } = render(
      <HeadlinesWidget widget={widget} data={[]} fetchedAt={yesterday} />,
    );
    expect(container.querySelector('.stale-caption')?.textContent).toBe('─ yesterday');
  });
});
