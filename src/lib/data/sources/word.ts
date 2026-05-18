/**
 * Word of the day.
 *
 * Picks a word deterministically from `WORDS` by day-of-year, then looks up
 * the definition via the Free Dictionary API (no key).
 *
 *   GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}
 *
 * When the upstream call fails (it does, often — the public API has flaky
 * uptime), falls back to the inline `definition` baked into each `WORDS`
 * entry and marks the TextItem with `offline: true`. The widget renders a
 * small `(offline)` marker on this path. Mirrors the always-offline `stoic`
 * source pattern (#87).
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

export type WordEntry = {
  word: string;
  partOfSpeech: string;
  /** Concise inline definition — used when upstream fetch fails (#87). */
  definition: string;
};

/**
 * 50 curated words with inline definitions for offline fallback (#87).
 * Order is fixed — `pickWord` indexes by day-of-year, so reordering would
 * shift every user's "today's word" by one position. Append-only for safety.
 */
export const WORDS: WordEntry[] = [
  { word: 'amaranthine', partOfSpeech: 'adjective', definition: 'undying; eternally beautiful' },
  { word: 'apricity', partOfSpeech: 'noun', definition: 'the warmth of the sun in winter' },
  {
    word: 'cromulent',
    partOfSpeech: 'adjective',
    definition: 'acceptable or fine; appearing genuine though invented',
  },
  { word: 'defenestrate', partOfSpeech: 'verb', definition: 'to throw someone out of a window' },
  { word: 'dyspepsia', partOfSpeech: 'noun', definition: 'indigestion; irritability of temper' },
  { word: 'ephemeral', partOfSpeech: 'adjective', definition: 'lasting for a very short time' },
  {
    word: 'eudaimonia',
    partOfSpeech: 'noun',
    definition: 'a state of human flourishing; the highest good',
  },
  { word: 'fanfaronade', partOfSpeech: 'noun', definition: 'arrogant or empty boasting; bluster' },
  { word: 'flummox', partOfSpeech: 'verb', definition: 'to perplex or bewilder' },
  {
    word: 'halcyon',
    partOfSpeech: 'adjective',
    definition: 'denoting a past time idyllically calm and happy',
  },
  {
    word: 'hiraeth',
    partOfSpeech: 'noun',
    definition: 'a deep, often wistful longing for a home one cannot return to',
  },
  { word: 'hodgepodge', partOfSpeech: 'noun', definition: 'a confused mixture; a jumble' },
  {
    word: 'hyperbole',
    partOfSpeech: 'noun',
    definition: 'deliberate exaggeration for rhetorical effect',
  },
  {
    word: 'ineffable',
    partOfSpeech: 'adjective',
    definition: 'too great or extreme to be expressed in words',
  },
  {
    word: 'kenopsia',
    partOfSpeech: 'noun',
    definition: 'the eerie atmosphere of a place usually bustling but now empty',
  },
  { word: 'kerfuffle', partOfSpeech: 'noun', definition: 'a commotion or fuss' },
  { word: 'lachrymose', partOfSpeech: 'adjective', definition: 'tearful; given to weeping' },
  {
    word: 'languor',
    partOfSpeech: 'noun',
    definition: 'tiredness or inactivity; pleasant relaxation',
  },
  {
    word: 'limerence',
    partOfSpeech: 'noun',
    definition: 'the state of being infatuated or obsessed with another person',
  },
  {
    word: 'mellifluous',
    partOfSpeech: 'adjective',
    definition: 'sweet or musical; pleasant to hear',
  },
  {
    word: 'mondegreen',
    partOfSpeech: 'noun',
    definition: 'a misheard word or phrase, especially a lyric',
  },
  {
    word: 'noctambulant',
    partOfSpeech: 'adjective',
    definition: 'walking or wandering at night',
  },
  { word: 'nyctophilia', partOfSpeech: 'noun', definition: 'a love of night or darkness' },
  {
    word: 'obfuscate',
    partOfSpeech: 'verb',
    definition: 'to deliberately make unclear or obscure',
  },
  {
    word: 'opsimath',
    partOfSpeech: 'noun',
    definition: 'a person who begins to learn or study late in life',
  },
  {
    word: 'parsimony',
    partOfSpeech: 'noun',
    definition: 'extreme unwillingness to spend money or use resources',
  },
  {
    word: 'pellucid',
    partOfSpeech: 'adjective',
    definition: 'translucently clear; easily understood',
  },
  {
    word: 'perspicacious',
    partOfSpeech: 'adjective',
    definition: 'having keen mental discernment; insightful',
  },
  {
    word: 'petrichor',
    partOfSpeech: 'noun',
    definition: 'the pleasant earthy smell after rain on dry ground',
  },
  { word: 'propinquity', partOfSpeech: 'noun', definition: 'nearness in place, time, or kinship' },
  {
    word: 'quagmire',
    partOfSpeech: 'noun',
    definition: 'a difficult, unpleasant, or entrapping situation',
  },
  {
    word: 'quintessence',
    partOfSpeech: 'noun',
    definition: 'the most perfect or typical example of a quality or class',
  },
  { word: 'recondite', partOfSpeech: 'adjective', definition: 'little known; abstruse or obscure' },
  {
    word: 'sangfroid',
    partOfSpeech: 'noun',
    definition: 'composure in danger or under trying circumstances',
  },
  {
    word: 'scintilla',
    partOfSpeech: 'noun',
    definition: 'a tiny trace or spark of a specified quality',
  },
  {
    word: 'sempiternal',
    partOfSpeech: 'adjective',
    definition: 'eternal and unchanging; everlasting',
  },
  { word: 'sobriquet', partOfSpeech: 'noun', definition: "a person's nickname" },
  {
    word: 'sonder',
    partOfSpeech: 'noun',
    definition: 'the realization that each passerby has a life as vivid as your own',
  },
  {
    word: 'soporific',
    partOfSpeech: 'adjective',
    definition: 'tending to induce drowsiness or sleep',
  },
  { word: 'susurrus', partOfSpeech: 'noun', definition: 'whispering, murmuring, or rustling' },
  { word: 'taradiddle', partOfSpeech: 'noun', definition: 'a petty lie; pretentious nonsense' },
  {
    word: 'tintinnabulation',
    partOfSpeech: 'noun',
    definition: 'the ringing or tinkling sound of bells',
  },
  {
    word: 'ultracrepidarian',
    partOfSpeech: 'noun',
    definition: 'a person who expresses opinions on matters outside their expertise',
  },
  {
    word: 'vagary',
    partOfSpeech: 'noun',
    definition: 'an unexpected, capricious, or inexplicable change',
  },
  {
    word: 'verisimilitude',
    partOfSpeech: 'noun',
    definition: 'the appearance of being true or real',
  },
  {
    word: 'vespertine',
    partOfSpeech: 'adjective',
    definition: 'relating to or occurring in the evening',
  },
  {
    word: 'vicissitude',
    partOfSpeech: 'noun',
    definition: 'a change of circumstances, typically unpleasant',
  },
  {
    word: 'weltschmerz',
    partOfSpeech: 'noun',
    definition: 'weariness of the world; sentimental sadness about its imperfections',
  },
  {
    word: 'zeitgeist',
    partOfSpeech: 'noun',
    definition: 'the defining spirit or mood of a particular period',
  },
  {
    word: 'zugzwang',
    partOfSpeech: 'noun',
    definition: "a chess position in which any move worsens the player's position",
  },
];

type DictEntry = {
  word?: string;
  phonetic?: string;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string }>;
  }>;
};

export function pickWord(date: Date = new Date()): WordEntry {
  return WORDS[dayOfYear(date) % WORDS.length];
}

/** Shape the offline fallback into the TextItem envelope (#87). */
function offlineTextItem(entry: WordEntry): TextItem {
  return {
    body: entry.definition,
    attribution: `${entry.word} (${entry.partOfSpeech})`,
    sourceLabel: 'offline word list',
    offline: true,
  };
}

export async function fetchWord(date: Date = new Date()): Promise<FetchResult<TextItem>> {
  const entry = pickWord(date);
  const today = formatDate(date);

  return withResilience<TextItem>(sourceKey('word', today), {
    staleFallbackKey: sourceKey('word', yesterday(date)),
    fetcher: async (): Promise<FetchResult<TextItem>> => {
      const res = await fetchUpstream<DictEntry[]>(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${entry.word}`,
      );

      // Upstream failed at the transport level — use the offline fallback
      // instead of cascading to staleFallbackKey (which would be yesterday's
      // WORD, not today's word's definition).
      if (!res.ok) {
        return { ok: true, fresh: false, data: offlineTextItem(entry) };
      }

      const dictEntry = res.data?.[0];
      const def = dictEntry?.meanings?.[0]?.definitions?.[0]?.definition;
      // Upstream returned but with no usable definition — also fall back.
      // Better to render the curated inline definition than "could not load".
      if (!def) {
        return { ok: true, fresh: false, data: offlineTextItem(entry) };
      }

      const pos = dictEntry?.meanings?.[0]?.partOfSpeech ?? entry.partOfSpeech;
      const phonetic = dictEntry?.phonetic ?? '';
      const attribution = [`${entry.word}`, pos && `(${pos})`, phonetic].filter(Boolean).join(' ');

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
