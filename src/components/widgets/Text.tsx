/**
 * Daily-text widget — renders the TextItem returned by a text fetcher
 * (quote, stoic, poem, onthisday, wikipedia, word). Per design/03-widget-specs.md
 * → `text`.
 *
 * `body` uses `white-space: pre-wrap` (via the .text-body CSS class) so
 * poems and on-this-day blocks preserve newlines.
 */
import type { TextWidget as TextWidgetConfig } from '@/lib/config';
import type { TextItem } from '@/lib/data/sources/types';
import { Panel } from './Panel';
import { CouldNotLoad } from './CouldNotLoad';
import { StaleCaption } from './StaleCaption';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type Props = {
  widget: TextWidgetConfig;
  data: TextItem | null;
  /**
   * When the widget's data was originally fetched (YYYY-MM-DD UTC). Threaded
   * from `withResilience` via the dispatcher. Surfaces "yesterday" /
   * "from May 10" via <StaleCaption /> when content was served from a
   * previous-day cache. Per #81b.
   */
  fetchedAt?: string | null;
};

/** `onthisday` titles get `· MM/DD` appended per design/03. */
function titleWith(widget: TextWidgetConfig, date: Date = new Date()): string {
  if (widget.source !== 'onthisday') return widget.title;
  const month = MONTH_NAMES[date.getUTCMonth()];
  return `${widget.title} · ${month} ${date.getUTCDate()}`;
}

export function TextWidget({ widget, data, fetchedAt }: Props) {
  return (
    <Panel color={widget.color} span={widget.span} icon={widget.icon} title={titleWith(widget)}>
      {!data ? (
        <CouldNotLoad />
      ) : (
        <>
          <div className="text-body">{data.body}</div>
          {data.attribution && (
            <div className="text-attribution">
              —{' '}
              {data.link ? (
                <a href={data.link} target="_blank" rel="noopener noreferrer">
                  {data.attribution}
                </a>
              ) : (
                data.attribution
              )}
            </div>
          )}
          {data.sourceLabel && <div className="text-source">{data.sourceLabel}</div>}
          <StaleCaption fetchedAt={fetchedAt} />
        </>
      )}
    </Panel>
  );
}
