/**
 * Stoic quote of the day — fully offline.
 *
 * 31 quotes from public-domain translations of Marcus Aurelius, Seneca, and
 * Epictetus (George Long, Gummere, Carter — all 19th/early-20th-c PD).
 * Picked deterministically by day-of-year so it changes daily but never
 * fluctuates within a day. No network, no cache — computed at render time.
 *
 * Per design/04-data-sources.md → `stoic`.
 */
import { dayOfYear } from '@/lib/date';
import type { FetchResult } from '../types';
import type { TextItem } from './types';

type Quote = { body: string; attribution: string };

export const STOIC: Quote[] = [
  {
    body: 'The happiness of your life depends upon the quality of your thoughts.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'Waste no more time arguing what a good man should be. Be one.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'You have power over your mind — not outside events. Realize this, and you will find strength.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'If it is not right, do not do it; if it is not true, do not say it.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'The best revenge is to be unlike him who performed the injury.',
    attribution: 'Marcus Aurelius',
  },
  { body: 'Confine yourself to the present.', attribution: 'Marcus Aurelius' },
  {
    body: 'The soul becomes dyed with the colour of its thoughts.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'Begin the morning by saying to thyself, I shall meet with the busybody, the ungrateful, arrogant, deceitful, envious, unsocial.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'How much trouble he avoids who does not look to see what his neighbor says or does or thinks.',
    attribution: 'Marcus Aurelius',
  },
  {
    body: 'Loss is nothing else but change, and change is Nature’s delight.',
    attribution: 'Marcus Aurelius',
  },
  { body: 'We suffer more often in imagination than in reality.', attribution: 'Seneca' },
  { body: 'He who is brave is free.', attribution: 'Seneca' },
  { body: 'Difficulties strengthen the mind, as labor does the body.', attribution: 'Seneca' },
  {
    body: 'Begin at once to live, and count each separate day as a separate life.',
    attribution: 'Seneca',
  },
  { body: 'Sometimes even to live is an act of courage.', attribution: 'Seneca' },
  {
    body: 'It is not the man who has too little, but the man who craves more, that is poor.',
    attribution: 'Seneca',
  },
  { body: 'While we are postponing, life speeds by.', attribution: 'Seneca' },
  {
    body: 'True happiness is to enjoy the present, without anxious dependence upon the future.',
    attribution: 'Seneca',
  },
  { body: 'No man was ever wise by chance.', attribution: 'Seneca' },
  {
    body: 'Wherever there is a human being, there is an opportunity for a kindness.',
    attribution: 'Seneca',
  },
  {
    body: 'The willing, destiny guides them. The unwilling, destiny drags them.',
    attribution: 'Seneca',
  },
  {
    body: 'It is not what happens to you, but how you react to it that matters.',
    attribution: 'Epictetus',
  },
  {
    body: 'First say to yourself what you would be; and then do what you have to do.',
    attribution: 'Epictetus',
  },
  {
    body: 'We have two ears and one mouth so that we can listen twice as much as we speak.',
    attribution: 'Epictetus',
  },
  { body: 'Don’t explain your philosophy. Embody it.', attribution: 'Epictetus' },
  {
    body: 'He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.',
    attribution: 'Epictetus',
  },
  {
    body: 'Wealth consists not in having great possessions, but in having few wants.',
    attribution: 'Epictetus',
  },
  {
    body: 'Make the best use of what is in your power, and take the rest as it happens.',
    attribution: 'Epictetus',
  },
  { body: 'Only the educated are free.', attribution: 'Epictetus' },
  { body: 'Difficulty shows what men are.', attribution: 'Epictetus' },
  { body: 'If you wish to be a writer, write.', attribution: 'Epictetus' },
];

/** Synchronous — no network. Same envelope shape as the other text sources. */
export function fetchStoic(date: Date = new Date()): FetchResult<TextItem> {
  const idx = dayOfYear(date) % STOIC.length;
  const q = STOIC[idx];
  return {
    ok: true,
    fresh: false, // deterministic, not freshly fetched
    data: {
      body: q.body,
      attribution: q.attribution,
      sourceLabel: 'from the stoics',
    },
  };
}
