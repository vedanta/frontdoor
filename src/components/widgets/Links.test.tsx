import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinksWidget } from './Links';
import type { LinksWidget as LinksConfig } from '@/lib/config';

const widget: LinksConfig = {
  type: 'links',
  title: 'Morning',
  color: 'amber',
  icon: '◑',
  span: 1,
  links: [
    { name: 'NYT', url: 'https://nytimes.com', key: 'ny', tag: 'news' },
    { name: 'No Key', url: 'https://example.com' },
    { name: 'Custom Tag', url: 'https://x.com', tag: 'custom-tag' },
  ],
};

describe('LinksWidget', () => {
  it('renders one link per entry, with hrefs', () => {
    render(<LinksWidget widget={widget} />);
    expect(screen.getByRole('link', { name: /NYT/ })).toHaveAttribute(
      'href',
      'https://nytimes.com',
    );
    expect(screen.getByRole('link', { name: /No Key/ })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });

  it('opens links in a new tab with safe rel', () => {
    render(<LinksWidget widget={widget} />);
    const links = screen.getAllByRole('link');
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('applies known-tag class for documented tags, default for others', () => {
    const { container } = render(<LinksWidget widget={widget} />);
    expect(container.querySelector('.link-tag--news')).toBeInTheDocument();
    expect(container.querySelector('.link-tag--default')).toBeInTheDocument(); // custom-tag → default
  });

  it('renders the shortcut key badge when key is set', () => {
    render(<LinksWidget widget={widget} />);
    expect(screen.getByText('ny')).toBeInTheDocument();
  });
});
