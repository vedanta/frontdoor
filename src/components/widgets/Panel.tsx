/**
 * Shared panel chrome — every content widget renders into one of these.
 * Section dividers are NOT panels (transparent, full-width) — see SectionDivider.
 */
import type { ReactNode } from 'react';
import type { Color } from '@/lib/config';

type PanelProps = {
  color: Color;
  span?: 1 | 2 | 3 | 4;
  icon: string;
  title: string;
  children: ReactNode;
};

export function Panel({ color, span, icon, title, children }: PanelProps) {
  const classes = ['panel', `panel--${color}`];
  if (span && span > 1) classes.push(`panel--span-${span}`);
  return (
    <div className={classes.join(' ')}>
      <div className="panel-header">
        <div className="panel-icon">{icon}</div>
        <div className="panel-title">{title}</div>
      </div>
      {children}
    </div>
  );
}
