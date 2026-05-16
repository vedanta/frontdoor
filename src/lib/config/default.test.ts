import { describe, expect, it } from 'vitest';
import { DashboardConfigSchema, SECTION_IDS } from './schema';
import { DEFAULT_CONFIG } from './default';

/**
 * Round-trip test: the generated default config (from
 * scripts/migrate-default-config.ts) must validate against the schema.
 * If this fails, the migration script and the schema have drifted apart.
 */
describe('DEFAULT_CONFIG (migration output)', () => {
  it('validates against DashboardConfigSchema', () => {
    const result = DashboardConfigSchema.safeParse(DEFAULT_CONFIG);
    if (!result.success) {
      // Surface the first issue concisely for failure debugging.
      throw new Error(
        `DEFAULT_CONFIG failed schema validation: ${JSON.stringify(result.error.issues[0], null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it('has 6 sections in the canonical order', () => {
    expect(DEFAULT_CONFIG.sections.map((s) => s.id)).toEqual([...SECTION_IDS]);
  });

  it('weather widget has NYC fallback coords seeded', () => {
    const weather = DEFAULT_CONFIG.sections
      .flatMap((s) => s.widgets)
      .find((w) => w.type === 'weather');
    expect(weather).toBeDefined();
    if (weather && weather.type === 'weather') {
      expect(weather.lat).toBeCloseTo(40.71, 2);
      expect(weather.lon).toBeCloseTo(-74.01, 2);
    }
  });

  it('has at least one widget per section', () => {
    for (const section of DEFAULT_CONFIG.sections) {
      expect(section.widgets.length).toBeGreaterThan(0);
    }
  });

  it('every link/launcher shortcut key is unique', () => {
    const keys: string[] = [];
    for (const section of DEFAULT_CONFIG.sections) {
      for (const widget of section.widgets) {
        if (widget.type === 'links') {
          for (const link of widget.links) if (link.key) keys.push(link.key);
        } else if (widget.type === 'launcher') {
          for (const app of widget.apps) if (app.key) keys.push(app.key);
        }
      }
    }
    expect(new Set(keys).size).toBe(keys.length);
  });
});
