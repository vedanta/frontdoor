/**
 * Word of the day.
 *
 * Picks a word deterministically from `WORDS` by day-of-year, then looks up
 * the definition via the Free Dictionary API (no key).
 *
 *   GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}
 *
 * Per design/04-data-sources.md → `word`.
 */
import { dayOfYear } from '@/lib/date';
import { fetchUpstream } from '../fetch';
import { withResilience } from '../resilience';
import { formatDate, sourceKey } from '@/lib/kv';
import type { FetchResult } from '../types';
import type { TextItem } from './types';
import { yesterday } from './util';

export const WORDS: string[] = [
  'amaranthine',
  'apricity',
  'cromulent',
  'defenestrate',
  'dyspepsia',
  'ephemeral',
  'eudaimonia',
  'fanfaronade',
  'flummox',
  'halcyon',
  'hiraeth',
  'hodgepodge',
  'hyperbole',
  'ineffable',
  'kenopsia',
  'kerfuffle',
  'lachrymose',
  'languor',
  'limerence',
  'mellifluous',
  'mondegreen',
  'noctambulant',
  'nyctophilia',
  'obfuscate',
  'opsimath',
  'parsimony',
  'pellucid',
  'perspicacious',
  'petrichor',
  'propinquity',
  'quagmire',
  'quintessence',
  'recondite',
  'sangfroid',
  'scintilla',
  'sempiternal',
  'sobriquet',
  'sonder',
  'soporific',
  'susurrus',
  'taradiddle',
  'tintinnabulation',
  'ultracrepidarian',
  'vagary',
  'verisimilitude',
  'vespertine',
  'vicissitude',
  'weltschmerz',
  'zeitgeist',
  'zugzwang',
];

type DictEntry = {
  word?: string;
  phonetic?: string;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string }>;
  }>;
};

export function pickWord(date: Date = new Date()): string {
  return WORDS[dayOfYear(date) % WORDS.length];
}

export async function fetchWord(date: Date = new Date()): Promise<FetchResult<TextItem>> {
  const word = pickWord(date);
  const today = formatDate(date);

  return withResilience<TextItem>(sourceKey('word', today), {
    staleFallbackKey: sourceKey('word', yesterday(date)),
    fetcher: async (): Promise<FetchResult<TextItem>> => {
      const res = await fetchUpstream<DictEntry[]>(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
      );
      if (!res.ok) return { ok: false, reason: res.reason };

      const entry = res.data?.[0];
      const def = entry?.meanings?.[0]?.definitions?.[0]?.definition;
      if (!def) return { ok: false, reason: 'word-no-definition' };

      const pos = entry?.meanings?.[0]?.partOfSpeech ?? '';
      const phonetic = entry?.phonetic ?? '';
      const attribution = [`${word}`, pos && `(${pos})`, phonetic].filter(Boolean).join(' ');

      return {
        ok: true,
        fresh: true,
        data: {
          body: def,
          attribution,
          sourceLabel: 'via Free Dictionary API',
        },
      };
    },
  });
}
