import { describe, expect, it } from 'vitest';
import { DashboardConfigSchema, SECTION_IDS, type DashboardConfig, type Widget } from './schema';

/** A minimal-but-valid config for use as a starting point in tests. */
function valid(): DashboardConfig {
  return {
    title: 'frontdoor',
    version: '1.0',
    grid: { columns: 4 },
    theme: 'dark',
    sections: SECTION_IDS.map((id) => ({
      id,
      title: id,
      widgets: [],
    })),
  };
}

/**
 * The tests below intentionally push malformed widgets to verify Zod rejects them.
 * Using a type assertion (vs `@ts-expect-error`) so the test file itself stays
 * type-clean — the assertion is the seam where we admit "we know this is wrong;
 * we're testing the runtime check."
 */
const bad = <T>(value: unknown): T => value as T;

describe('DashboardConfigSchema', () => {
  it('accepts a minimal valid config', () => {
    expect(DashboardConfigSchema.safeParse(valid()).success).toBe(true);
  });

  it('rejects fewer than 6 sections', () => {
    const c = valid();
    c.sections = c.sections.slice(0, 5);
    expect(DashboardConfigSchema.safeParse(c).success).toBe(false);
  });

  it('rejects more than 6 sections', () => {
    const c = valid();
    c.sections = [...c.sections, { id: 'arrive', title: 'extra', widgets: [] }];
    expect(DashboardConfigSchema.safeParse(c).success).toBe(false);
  });

  it('rejects sections in the wrong order', () => {
    const c = valid();
    [c.sections[0], c.sections[1]] = [c.sections[1], c.sections[0]];
    const result = DashboardConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /fixed order/.test(i.message))).toBe(true);
    }
  });

  it('rejects an unknown widget type', () => {
    const c = valid();
    c.sections[0].widgets.push(
      bad<Widget>({
        type: 'cowbell',
        title: 'More',
        color: 'cyan',
        icon: '🐄',
        span: 1,
      }),
    );
    expect(DashboardConfigSchema.safeParse(c).success).toBe(false);
  });

  it('rejects a links widget missing the required url', () => {
    const c = valid();
    c.sections[0].widgets.push(
      bad<Widget>({
        type: 'links',
        title: 'Links',
        color: 'amber',
        icon: '◑',
        span: 1,
        links: [{ name: 'NYT' }],
      }),
    );
    expect(DashboardConfigSchema.safeParse(c).success).toBe(false);
  });

  it('rejects an invalid url', () => {
    const c = valid();
    c.sections[0].widgets.push({
      type: 'links',
      title: 'Links',
      color: 'amber',
      icon: '◑',
      span: 1,
      links: [{ name: 'NYT', url: 'not-a-url' }],
    });
    expect(DashboardConfigSchema.safeParse(c).success).toBe(false);
  });

  it('rejects duplicated shortcut keys across links and launcher widgets', () => {
    const c = valid();
    c.sections[0].widgets.push({
      type: 'links',
      title: 'A',
      color: 'amber',
      icon: '◑',
      span: 1,
      links: [{ name: 'A', url: 'https://a.example.com', key: 'a' }],
    });
    c.sections[1].widgets.push({
      type: 'launcher',
      title: 'Apps',
      color: 'cyan',
      icon: '⊞',
      span: 4,
      columns: 4,
      apps: [{ name: 'A', url: 'https://a.example.com', key: 'a' }], // collision
    });
    const result = DashboardConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /unique/.test(i.message))).toBe(true);
    }
  });

  it('accepts unique shortcut keys across widgets', () => {
    const c = valid();
    c.sections[0].widgets.push({
      type: 'links',
      title: 'A',
      color: 'amber',
      icon: '◑',
      span: 1,
      links: [{ name: 'A', url: 'https://a.example.com', key: 'a' }],
    });
    c.sections[1].widgets.push({
      type: 'launcher',
      title: 'Apps',
      color: 'cyan',
      icon: '⊞',
      span: 4,
      columns: 4,
      apps: [{ name: 'B', url: 'https://b.example.com', key: 'b' }],
    });
    expect(DashboardConfigSchema.safeParse(c).success).toBe(true);
  });

  it('image source: nasa-apod does not require url', () => {
    const c = valid();
    c.sections[2].widgets.push({
      type: 'image',
      title: 'NASA',
      color: 'blue',
      icon: '✦',
      span: 2,
      source: 'nasa-apod',
    });
    expect(DashboardConfigSchema.safeParse(c).success).toBe(true);
  });

  it('image source: static requires url', () => {
    const c = valid();
    c.sections[2].widgets.push({
      type: 'image',
      title: 'Static',
      color: 'blue',
      icon: '✦',
      span: 2,
      source: 'static',
      // url intentionally missing
    });
    const result = DashboardConfigSchema.safeParse(c);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /static/.test(i.message))).toBe(true);
    }
  });

  it('weather widget requires lat/lon (no auto-geolocation in MVP)', () => {
    const c = valid();
    c.sections[1].widgets.push(
      bad<Widget>({
        type: 'weather',
        title: 'Weather',
        color: 'blue',
        icon: '◈',
        span: 1,
      }),
    );
    expect(DashboardConfigSchema.safeParse(c).success).toBe(false);
  });
});
