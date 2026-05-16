import { describe, expect, it, vi } from 'vitest';
import { buildShortcuts, resolveSearchTarget, type ShortcutMap } from './shortcuts';
import type { DashboardConfig } from '@/lib/config';

function configFromKeys(opts: {
  linkKeys?: Array<{ key: string; url: string }>;
  appKeys?: Array<{ key: string; url: string }>;
}): DashboardConfig {
  return {
    title: 'frontdoor',
    version: '1.0',
    grid: { columns: 4 },
    theme: 'dark',
    sections: [
      {
        id: 'arrive',
        title: 'Arrive',
        widgets: opts.linkKeys
          ? [
              {
                type: 'links',
                title: 'Links',
                color: 'amber',
                icon: '◑',
                span: 1,
                links: opts.linkKeys.map((k) => ({ name: k.key, url: k.url, key: k.key })),
              },
            ]
          : [],
      },
      {
        id: 'act',
        title: 'Act',
        widgets: opts.appKeys
          ? [
              {
                type: 'launcher',
                title: 'Apps',
                color: 'cyan',
                icon: '⊞',
                span: 4,
                columns: 4,
                apps: opts.appKeys.map((k) => ({ name: k.key, url: k.url, key: k.key })),
              },
            ]
          : [],
      },
      { id: 'reward', title: 'Reward', widgets: [] },
      { id: 'read', title: 'Read', widgets: [] },
      { id: 'discover', title: 'Discover', widgets: [] },
      { id: 'depart', title: 'Depart', widgets: [] },
    ],
  };
}

describe('buildShortcuts', () => {
  it('collects keys from links + launcher widgets', () => {
    const map = buildShortcuts(
      configFromKeys({
        linkKeys: [{ key: 'ny', url: 'https://nytimes.com' }],
        appKeys: [{ key: 'cg', url: 'https://chat.openai.com' }],
      }),
    );
    expect(map).toEqual({
      ny: 'https://nytimes.com',
      cg: 'https://chat.openai.com',
    });
  });

  it('skips entries without a key', () => {
    const cfg = configFromKeys({});
    cfg.sections[0].widgets.push({
      type: 'links',
      title: 'X',
      color: 'amber',
      icon: '◑',
      span: 1,
      links: [{ name: 'A', url: 'https://a.com' }], // no key
    });
    expect(buildShortcuts(cfg)).toEqual({});
  });

  it('warns on collisions, last wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = buildShortcuts(
      configFromKeys({
        linkKeys: [{ key: 'x', url: 'https://first.com' }],
        appKeys: [{ key: 'x', url: 'https://second.com' }],
      }),
    );
    expect(map.x).toBe('https://second.com');
    expect(warn).toHaveBeenCalledWith('[shortcuts] collisions detected (last wins):', ['x']);
    warn.mockRestore();
  });
});

describe('resolveSearchTarget', () => {
  const shortcuts: ShortcutMap = { ny: 'https://nytimes.com', hn: 'https://news.ycombinator.com' };

  it('returns "" for empty/whitespace', () => {
    expect(resolveSearchTarget('', shortcuts)).toBe('');
    expect(resolveSearchTarget('   ', shortcuts)).toBe('');
  });

  it('matches shortcut (case-insensitive)', () => {
    expect(resolveSearchTarget('ny', shortcuts)).toBe('https://nytimes.com');
    expect(resolveSearchTarget('NY', shortcuts)).toBe('https://nytimes.com');
    expect(resolveSearchTarget('  hn  ', shortcuts)).toBe('https://news.ycombinator.com');
  });

  it('passes a full URL through', () => {
    expect(resolveSearchTarget('https://example.com/x', shortcuts)).toBe('https://example.com/x');
  });

  it('prepends https:// to bare host-like input', () => {
    expect(resolveSearchTarget('example.com', shortcuts)).toBe('https://example.com');
    expect(resolveSearchTarget('sub-domain.example.io', shortcuts)).toBe(
      'https://sub-domain.example.io',
    );
  });

  it('falls back to Google search', () => {
    expect(resolveSearchTarget('best espresso machine', shortcuts)).toBe(
      'https://www.google.com/search?q=best%20espresso%20machine',
    );
  });
});
