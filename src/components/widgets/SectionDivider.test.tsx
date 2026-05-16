import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionDivider } from './SectionDivider';

describe('SectionDivider', () => {
  it('renders title and subtitle', () => {
    render(<SectionDivider id="arrive" title="Good Morning" subtitle="pause before you begin" />);
    expect(screen.getByText('Good Morning')).toBeInTheDocument();
    expect(screen.getByText('pause before you begin')).toBeInTheDocument();
  });

  it('omits subtitle when not provided', () => {
    const { container } = render(<SectionDivider id="depart" title="Closing" />);
    expect(container.querySelector('.section-divider-sub')).toBeNull();
  });

  it('exposes the section id as a data attribute', () => {
    const { container } = render(<SectionDivider id="act" title="Launch Pad" />);
    expect(container.firstChild).toHaveAttribute('data-section-id', 'act');
  });
});
