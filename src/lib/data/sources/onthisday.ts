/**
 * On This Day — Wikipedia historical events for today's month/day.
 *   GET https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{M}/{D}
 *
 * From .events[] (each {year, text}), pick 2 spread across the list
 * (step = floor(len/2)) and join with `\n\n` as `{year} — {text}`.
 *
 * No API key. Per design/04-data-sources.md.
 */
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { TextItem } from './types';
import { yesterday } from './util';

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

type OnThisDayResponse = {
  events?: Array<{ year: number; text: string }>;
};

export async function fetchOnThisDay(d: Date = new Date()): Promise<FetchResult<TextItem>> {
  const today = formatDate(d);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();

  return withResilience<TextItem>(sourceKey('onthisday', today), {
    staleFallbackKey: sourceKey('onthisday', yesterday(d)),
    fetcher: async (): Promise<FetchResult<TextItem>> => {
      const res = await fetchUpstream<OnThisDayResponse>(
        `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${m}/${day}`,
      );
      if (!res.ok) return { ok: false, reason: res.reason };

      const events = res.data.events ?? [];
      if (events.length === 0) return { ok: false, reason: 'onthisday-no-events' };

      // Pick 2 events spread across the list.
      const step = Math.max(1, Math.floor(events.length / 2));
      const picks = [events[0]];
      if (events.length > 1) picks.push(events[step] ?? events[events.length - 1]);

      const body = picks.map((e) => `${e.year} — ${e.text}`).join('\n\n');
      const monthName = MONTH_NAMES[m - 1] ?? '';

      return {
        ok: true,
        fresh: true,
        data: {
          body,
          attribution: `On this day — ${monthName} ${day}`,
          sourceLabel: 'via Wikipedia',
        },
      };
    },
  });
}
