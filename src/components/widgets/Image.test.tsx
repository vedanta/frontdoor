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

  it('shows "could not load" for a daily source with null data', () => {
    render(<ImageWidget widget={dailyWidget} data={null} />);
    expect(screen.getByText('could not load')).toBeInTheDocument();
  });
});
