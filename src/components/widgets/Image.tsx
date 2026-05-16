/**
 * Picture-of-the-day widget — renders the ImageItem returned by a daily image
 * fetcher (nasa-apod, bing-daily, wikimedia-potd) OR the inline fields of a
 * `source: 'static'` widget config.
 *
 * Per design/03-widget-specs.md → `image`.
 */
import type { ImageWidget as ImageWidgetConfig } from '@/lib/config';
import type { ImageItem } from '@/lib/data/sources/types';
import { Panel } from './Panel';
import { CouldNotLoad } from './CouldNotLoad';

type Props = {
  widget: ImageWidgetConfig;
  /** Required for daily sources; ignored when source is 'static'. */
  data?: ImageItem | null;
};

function imageItemFromStatic(widget: ImageWidgetConfig): ImageItem | null {
  if (widget.source !== 'static') return null;
  if (!widget.url) return null;
  return {
    image: widget.url,
    caption: widget.caption ?? '',
    description: widget.description ?? '',
    link: widget.link ?? widget.url,
    sourceLabel: '',
  };
}

export function ImageWidget({ widget, data }: Props) {
  const item: ImageItem | null =
    widget.source === 'static' ? imageItemFromStatic(widget) : (data ?? null);

  return (
    <Panel color={widget.color} span={widget.span} icon={widget.icon} title={widget.title}>
      {!item ? (
        <CouldNotLoad />
      ) : (
        <>
          <div className="image-widget">
            {item.link ? (
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- images come from arbitrary upstreams (NASA / Bing / Wikimedia / user-supplied static); configuring next/image remote-patterns per source is friction we don't want for MVP. */}
                <img src={item.image} alt={item.caption} loading="lazy" />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- see above
              <img src={item.image} alt={item.caption} loading="lazy" />
            )}
          </div>
          <div className="image-caption">
            <div className="image-caption-title">{item.caption}</div>
            {item.description && <div className="image-caption-desc">{item.description}</div>}
          </div>
          {item.sourceLabel && <div className="image-source">{item.sourceLabel}</div>}
        </>
      )}
    </Panel>
  );
}
