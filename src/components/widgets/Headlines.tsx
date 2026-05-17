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
import { StaleCaption } from './StaleCaption';

type Props = {
  widget: HeadlinesWidgetConfig;
  data: HeadlineItem[] | null;
  /**
   * When this feed-set was last successfully fetched. Threaded from
   * `withResilience` via the dispatcher; surfaces "yesterday" / etc.
   * when content was served from a previous-day cache. Per #81b/#81c.
   */
  fetchedAt?: string | null;
};

export function HeadlinesWidget({ widget, data, fetchedAt }: Props) {
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
          <StaleCaption fetchedAt={fetchedAt} />
        </>
      )}
    </Panel>
  );
}
