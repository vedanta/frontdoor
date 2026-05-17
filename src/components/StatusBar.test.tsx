import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBar, type StatusBarProps } from './StatusBar';

// Reasonable baseline matching the user's dashboard on 2026-05-17.
const baseProps: StatusBarProps = {
  version: {
    label: 'v0.1.0',
    href: 'https://github.com/vedanta/frontdoor/releases/tag/v0.1.0',
  },
  moonPhase: { emoji: '🌒', name: 'waxing crescent' },
  sunsetTime: '20:14',
  dayOfYear: 137,
  weekOfYear: 20,
  staleCount: 0,
};

describe('StatusBar (server component)', () => {
  it('renders the version as a link to the GitHub Release when href is set', () => {
    const { container } = render(<StatusBar {...baseProps} />);
    const link = container.querySelector('a.status-link');
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute('href')).toBe(baseProps.version.href);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toBe('v0.1.0');
  });

  it('renders the version as plain text (no link) when href is null', () => {
    const { container } = render(
      <StatusBar {...baseProps} version={{ label: 'dev', href: null }} />,
    );
    expect(container.querySelector('a.status-link')).not.toBeInTheDocument();
    expect(container.textContent).toContain('dev');
  });

  it('renders moon emoji + sunset glyph + HH:MM', () => {
    const { container } = render(<StatusBar {...baseProps} />);
    expect(container.textContent).toContain('🌒');
    expect(container.textContent).toContain('↓ 20:14');
  });

  it('omits the sunset chunk when sunsetTime is null', () => {
    const { container } = render(<StatusBar {...baseProps} sunsetTime={null} />);
    expect(container.textContent).toContain('🌒');
    expect(container.textContent).not.toContain('↓');
  });

  it('renders day-of-year and ISO week number', () => {
    const { container } = render(<StatusBar {...baseProps} />);
    expect(container.textContent).toContain('day 137');
    expect(container.textContent).toContain('week 20');
  });

  it('hides the aggregate-stale chunk when staleCount is 0', () => {
    const { container } = render(<StatusBar {...baseProps} staleCount={0} />);
    expect(container.textContent).not.toContain('stale');
  });

  it('hides the aggregate-stale chunk when staleCount is 1 (per-widget caption covers it)', () => {
    const { container } = render(<StatusBar {...baseProps} staleCount={1} />);
    expect(container.textContent).not.toContain('stale');
  });

  it('shows the aggregate-stale chunk when staleCount >= 2', () => {
    const { container } = render(<StatusBar {...baseProps} staleCount={3} />);
    expect(container.textContent).toContain('3 widgets stale');
  });

  it('renders the embedded FontControls (.status-fontsize)', () => {
    const { container } = render(<StatusBar {...baseProps} />);
    expect(container.querySelector('.status-fontsize')).toBeInTheDocument();
  });

  it('exposes moon phase name as accessible label', () => {
    const { container } = render(<StatusBar {...baseProps} />);
    const moon = container.querySelector('.status-moon');
    expect(moon?.getAttribute('aria-label')).toBe('waxing crescent');
  });
});
