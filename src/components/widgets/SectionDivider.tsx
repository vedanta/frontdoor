/**
 * Section divider — title + gradient hairline + optional subtitle.
 * Full-width, transparent, no card. The structural bone between the 6 layout
 * sections (Arrive → Act → … → Depart).
 */
import type { Section } from '@/lib/config';

type Props = Pick<Section, 'id' | 'title' | 'subtitle'>;

export function SectionDivider({ id, title, subtitle }: Props) {
  return (
    <div
      className="panel--span-4"
      style={{ background: 'transparent', border: 'none', padding: '16px 0 4px 0' }}
      data-section-id={id}
    >
      <div className="section-divider">
        <span className="section-divider-title">{title}</span>
        <span className="section-divider-line" />
        {subtitle && <span className="section-divider-sub">{subtitle}</span>}
      </div>
    </div>
  );
}
