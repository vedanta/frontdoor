import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageWidget } from './Image';
import type { ImageWidget as ImageConfig } from '@/lib/config';

const dailyWidget: ImageConfig = {
  type: 'image',
  title: 'NASA',
  color: 'blue',
  icon: '✦',
  span: 2,
  source: 'nasa-apod',
};

describe('ImageWidget', () => {
  it('renders fetched ImageItem (img + caption + description + source label)', () => {
    render(
      <ImageWidget
        widget={dailyWidget}
        data={{
          image: 'https://apod.nasa.gov/x.jpg',
          caption: 'Veil Nebula',
          description: 'A glowing remnant.',
          link: 'https://apod.nasa.gov/apod.html',
          sourceLabel: 'via NASA APOD API',
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Veil Nebula' })).toHaveAttribute(
      'src',
      'https://apod.nasa.gov/x.jpg',
    );
    expect(screen.getByText('Veil Nebula')).toBeInTheDocument();
    expect(screen.getByText('A glowing remnant.')).toBeInTheDocument();
    expect(screen.getByText('via NASA APOD API')).toBeInTheDocument();
  });

  it('inlines fields directly when source is "static" (no data prop needed)', () => {
    render(
      <ImageWidget
        widget={{
          type: 'image',
          title: 'Logo',
          color: 'cyan',
          icon: '✦',
          span: 2,
          source: 'static',
          url: 'https://example.com/logo.png',
          caption: 'My logo',
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'My logo' })).toHaveAttribute(
      'src',
      'https://example.com/logo.png',
    );
  });

  it('shows the calm placeholder SVG for a daily source with null data (#81)', () => {
    const { container } = render(<ImageWidget widget={dailyWidget} data={null} />);
    // The placeholder uses an empty alt + data-testid for the SVG image
    const placeholder = container.querySelector('[data-testid="image-widget-placeholder"]');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.getAttribute('src')).toBe('/placeholders/widget-fallback.svg');
    // No "could not load" text — replaced by the calm placeholder
    expect(screen.queryByText('could not load')).not.toBeInTheDocument();
    // The wrapper carries the modifier class so CSS can tune the placeholder variant
    expect(container.querySelector('.image-widget--placeholder')).toBeInTheDocument();
  });

  it('does NOT render the stale caption when fetchedAt is today (#81b)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { container } = render(
      <ImageWidget
        widget={dailyWidget}
        fetchedAt={today}
        data={{
          image: 'https://apod.nasa.gov/x.jpg',
          caption: 'Veil Nebula',
          description: 'A glowing remnant.',
          link: 'https://apod.nasa.gov/apod.html',
          sourceLabel: 'via NASA APOD API',
        }}
      />,
    );
    expect(container.querySelector('.stale-caption')).not.toBeInTheDocument();
  });

  it('renders the stale caption when fetchedAt is older than today (#81b)', () => {
    // Pick a fetchedAt that's reliably yesterday relative to test execution
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { container } = render(
      <ImageWidget
        widget={dailyWidget}
        fetchedAt={yesterday}
        data={{
          image: 'https://apod.nasa.gov/x.jpg',
          caption: 'Veil Nebula',
          description: 'A glowing remnant.',
          link: 'https://apod.nasa.gov/apod.html',
          sourceLabel: 'via NASA APOD API',
        }}
      />,
    );
    expect(container.querySelector('.stale-caption')?.textContent).toBe('─ yesterday');
  });

  it('does NOT render the stale caption when fetchedAt is null (legacy / unknown)', () => {
    const { container } = render(
      <ImageWidget
        widget={dailyWidget}
        fetchedAt={null}
        data={{
          image: 'https://apod.nasa.gov/x.jpg',
          caption: 'Veil Nebula',
          description: 'A glowing remnant.',
          link: 'https://apod.nasa.gov/apod.html',
          sourceLabel: 'via NASA APOD API',
        }}
      />,
    );
    expect(container.querySelector('.stale-caption')).not.toBeInTheDocument();
  });
});
