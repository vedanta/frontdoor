/**
 * POST /api/refresh — daily cache-warming + revalidation, cron-triggered.
 *
 * Fired by Vercel Cron (vercel.json) at 03:00 UTC daily.
 * Vercel automatically attaches `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Two phases:
 *   1. Warm every global source via Promise.allSettled (one slow / failed
 *      source doesn't block the others; each fetcher already writes its KV
 *      entry on success via withResilience).
 *   2. Revalidate every user's `/d/{slug}` page so the next visit serves
 *      the freshly-warmed cache.
 *
 * Headlines: only the DEFAULT_CONFIG's feed sets are warmed (most users
 * haven't edited yet, so this covers the common case). Per-user feed-set
 * variations lazy-fetch on first render after midnight.
 *
 * Per docs/architecture.md §3.3, §6.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_CONFIG } from '@/lib/config';
import { fetchBingDaily } from '@/lib/data/sources/bing-daily';
import { fetchHeadlines } from '@/lib/data/sources/headlines';
import { fetchNasaApod } from '@/lib/data/sources/nasa-apod';
import { fetchOnThisDay } from '@/lib/data/sources/onthisday';
import { fetchPoem } from '@/lib/data/sources/poem';
import { fetchQuote } from '@/lib/data/sources/quote';
import { fetchWikimediaPotd } from '@/lib/data/sources/wikimedia-potd';
import { fetchWikipediaFeatured } from '@/lib/data/sources/wikipedia';
import { fetchWord } from '@/lib/data/sources/word';
import { checkCronAuth } from '@/lib/cron/auth';
import { revalidateAllUsers } from '@/lib/cron/revalidate';

type Task = { name: string; promise: Promise<{ ok: boolean }> };

function collectTasks(): Task[] {
  const tasks: Task[] = [
    { name: 'nasa-apod', promise: fetchNasaApod() },
    { name: 'bing-daily', promise: fetchBingDaily() },
    { name: 'wikimedia-potd', promise: fetchWikimediaPotd() },
    { name: 'quote', promise: fetchQuote() },
    { name: 'poem', promise: fetchPoem() },
    { name: 'onthisday', promise: fetchOnThisDay() },
    { name: 'wikipedia', promise: fetchWikipediaFeatured() },
    { name: 'word', promise: fetchWord() },
  ];

  // Headlines from DEFAULT_CONFIG — covers the common case (most users haven't
  // edited the default). Per-user variations lazy-fetch on first render.
  for (const section of DEFAULT_CONFIG.sections) {
    for (const widget of section.widgets) {
      if (widget.type === 'headlines') {
        tasks.push({
          name: `headlines:${widget.title}`,
          promise: fetchHeadlines(widget.feeds, widget.count),
        });
      }
    }
  }

  return tasks;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: auth.status });
  }

  const tasks = collectTasks();
  const settled = await Promise.allSettled(tasks.map((t) => t.promise));
  const sources = tasks.map((t, i) => {
    const r = settled[i];
    const ok =
      r.status === 'fulfilled' &&
      typeof r.value === 'object' &&
      r.value !== null &&
      'ok' in r.value &&
      (r.value as { ok: boolean }).ok === true;
    return { name: t.name, ok };
  });

  const warmed = sources.filter((s) => s.ok).length;
  const failed = sources.filter((s) => !s.ok).map((s) => s.name);

  // Chain: revalidate every user's ISR page so the next visit gets the warm cache.
  const reval = await revalidateAllUsers();

  return NextResponse.json({
    ok: failed.length === 0,
    warmed,
    failed,
    revalidated: reval.revalidated,
    revalidate_failed: reval.failed,
  });
}
