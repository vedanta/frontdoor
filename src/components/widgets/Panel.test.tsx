import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel', () => {
  it('renders the icon, uppercased title (CSS) and children', () => {
    const { container } = render(
      <Panel color="cyan" icon="✦" title="Scaffold">
        <p>body</p>
      </Panel>,
    );
    expect(screen.getByText('Scaffold')).toBeInTheDocument();
    expect(screen.getByText('✦')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('panel', 'panel--cyan');
  });

  it('adds panel--span-{n} when span > 1', () => {
    const { container } = render(
      <Panel color="blue" span={4} icon="◈" title="Wide">
        x
      </Panel>,
    );
    expect(container.firstChild).toHaveClass('panel--span-4');
  });

  it('omits span class when span is 1', () => {
    const { container } = render(
      <Panel color="amber" span={1} icon="◑" title="One">
        x
      </Panel>,
    );
    expect(container.firstChild).not.toHaveClass('panel--span-1');
  });
});
