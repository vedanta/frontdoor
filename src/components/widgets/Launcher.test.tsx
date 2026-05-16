import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LauncherWidget } from './Launcher';
import type { LauncherWidget as LauncherConfig } from '@/lib/config';

const widget: LauncherConfig = {
  type: 'launcher',
  title: 'Apps',
  color: 'cyan',
  icon: '⊞',
  span: 4,
  columns: 12,
  apps: [
    { name: 'ChatGPT', url: 'https://chat.openai.com', key: 'cg' },
    { name: 'Claude', url: 'https://claude.ai', key: 'cl', icon: 'https://custom.com/claude.png' },
  ],
};

describe('LauncherWidget', () => {
  it('renders one tile per app with icon.horse favicons by default', () => {
    render(<LauncherWidget widget={widget} />);
    const chatgptImg = screen.getByAltText('ChatGPT');
    expect(chatgptImg.getAttribute('src')).toMatch(/icon\.horse\/icon\/chat\.openai\.com/);
  });

  it('respects per-app icon override', () => {
    render(<LauncherWidget widget={widget} />);
    expect(screen.getByAltText('Claude').getAttribute('src')).toBe('https://custom.com/claude.png');
  });

  it('shows Name [key] in the tooltip when key is set', () => {
    const { container } = render(<LauncherWidget widget={widget} />);
    const tooltips = container.querySelectorAll('.launcher-tooltip');
    expect(Array.from(tooltips).map((t) => t.textContent)).toEqual(['ChatGPT [cg]', 'Claude [cl]']);
  });

  it('sets grid-template-columns based on the columns config', () => {
    const { container } = render(<LauncherWidget widget={widget} />);
    const grid = container.querySelector('.launcher-grid') as HTMLElement;
    expect(grid?.style.gridTemplateColumns).toBe('repeat(12, 1fr)');
  });
});
