/**
 * Headlines widget — renders the data returned by fetchHeadlines (#6).
 * Per design/03-widget-specs.md → `headlines`.
 *
 * Synchronous: caller (page assembly in #23) does the fetch and passes data.
 * `data === null` renders the "could not load" line.
 */
import type { HeadlinesWidget as HeadlinesWidgetConfig } from '@/lib/config';
import type { HeadlineItem } from '@/lib/data/sources/headlines';
import { Panel } from './Panel';
import { CouldNotLoad } from './CouldNotLoad';

type Props = {
  widget: HeadlinesWidgetConfig;
  data: HeadlineItem[] | null;
};

export function HeadlinesWidget({ widget, data }: Props) {
  return (
    <Panel color={widget.color} span={widget.span} icon={widget.icon} title={widget.title}>
      {!data ? (
        <CouldNotLoad />
      ) : (
        <>
          <ul className="headlines-list">
            {data.map((item, i) => (
              <li key={`${item.link}-${i}`}>
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  <span className="headline-title">{item.title}</span>
                  <span className="headline-source">{item.source}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="headlines-footer">via {widget.feeds.map((f) => f.name).join(', ')}</div>
        </>
      )}
    </Panel>
  );
}
