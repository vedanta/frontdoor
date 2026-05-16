/**
 * Bookmark-list widget. Config-only (no data fetch).
 * Per design/03-widget-specs.md → `links`.
 *   - Tag pills with dedicated colors for known tag values
 *   - Right-aligned shortcut-key badge (the search bar consumes the global map)
 *   - Opens in a new tab
 */
import type { LinksWidget } from '@/lib/config';
import { Panel } from './Panel';

type Props = { widget: LinksWidget };

const KNOWN_TAGS = new Set(['news', 'tech', 'ai', 'dev', 'media', 'social', 'biz', 'finance']);

export function LinksWidget({ widget }: Props) {
  return (
    <Panel color={widget.color} span={widget.span} icon={widget.icon} title={widget.title}>
      <ul className="link-list">
        {widget.links.map((link) => {
          const tagClass =
            link.tag && KNOWN_TAGS.has(link.tag)
              ? `link-tag link-tag--${link.tag}`
              : link.tag
                ? 'link-tag link-tag--default'
                : null;
          return (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {tagClass && <span className={tagClass}>{link.tag}</span>}
                <span>{link.name}</span>
                {link.key && <span className="link-key">{link.key}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
