/**
 * Dashboard config — Zod schemas + types.
 *
 * Canonical shape in design/05-config-schema.md. The 6 sections are first-class
 * (the original YAML's `type: section` inline dividers are flattened away into
 * section objects). Sections are fixed in id, count, and order.
 */
import { z } from 'zod';

export const SECTION_IDS = ['arrive', 'act', 'reward', 'read', 'discover', 'depart'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const COLORS = ['cyan', 'blue', 'violet', 'rose', 'amber', 'green'] as const;
export type Color = (typeof COLORS)[number];

export const ColorSchema = z.enum(COLORS);
export const SpanSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

// === Widget common fields ===

const widgetCommon = {
  title: z.string().min(1),
  color: ColorSchema,
  // Single literal char (some unicode glyphs are 2 code units, so allow up to 2).
  icon: z.string().min(1).max(2),
  span: SpanSchema,
};

// === Per-type widget schemas ===

export const LinksWidgetSchema = z.object({
  type: z.literal('links'),
  ...widgetCommon,
  links: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        key: z.string().min(1).optional(),
        tag: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

export const LauncherWidgetSchema = z.object({
  type: z.literal('launcher'),
  ...widgetCommon,
  columns: z.number().int().positive().default(4),
  apps: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        key: z.string().min(1).optional(),
        // explicit favicon override URL; default behavior is icon.horse(host(url))
        icon: z.string().url().optional(),
      }),
    )
    .min(1),
});

export const HeadlinesWidgetSchema = z.object({
  type: z.literal('headlines'),
  ...widgetCommon,
  count: z.number().int().positive().default(5),
  feeds: z
    .array(
      z.object({
        url: z.string().url(),
        name: z.string().min(1),
      }),
    )
    .min(1),
});

export const WeatherWidgetSchema = z.object({
  type: z.literal('weather'),
  ...widgetCommon,
  // MVP decision: lat/lon required in config (no auto-geolocation — see post-mvp.md A2).
  // Default config seeds NYC fallback coords.
  lat: z.number(),
  lon: z.number(),
});

export const IMAGE_SOURCES = ['nasa-apod', 'bing-daily', 'wikimedia-potd', 'static'] as const;
export const ImageWidgetSchema = z
  .object({
    type: z.literal('image'),
    ...widgetCommon,
    source: z.enum(IMAGE_SOURCES),
    // Used by `source: 'static'`; ignored otherwise.
    url: z.string().url().optional(),
    caption: z.string().optional(),
    description: z.string().optional(),
    link: z.string().url().optional(),
  })
  .refine((w) => w.source !== 'static' || typeof w.url === 'string', {
    message: "image with source='static' requires a `url`",
    path: ['url'],
  });

export const TEXT_SOURCES = ['quote', 'stoic', 'poem', 'onthisday', 'wikipedia', 'word'] as const;
export const TextWidgetSchema = z.object({
  type: z.literal('text'),
  ...widgetCommon,
  source: z.enum(TEXT_SOURCES),
});

export const WidgetSchema = z.discriminatedUnion('type', [
  LinksWidgetSchema,
  LauncherWidgetSchema,
  HeadlinesWidgetSchema,
  WeatherWidgetSchema,
  ImageWidgetSchema,
  TextWidgetSchema,
]);

// === Section ===

export const SectionSchema = z.object({
  id: z.enum(SECTION_IDS),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  widgets: z.array(WidgetSchema),
});

// === Top-level dashboard config ===

const baseDashboardSchema = z.object({
  title: z.string().min(1),
  version: z.string().min(1),
  grid: z.object({ columns: z.literal(4) }),
  theme: z.enum(['dark']),
  sections: z.array(SectionSchema).length(SECTION_IDS.length),
});

/** Collect all shortcut keys across links + launcher widgets, anywhere in the config. */
function collectShortcutKeys(config: z.infer<typeof baseDashboardSchema>): string[] {
  const keys: string[] = [];
  for (const section of config.sections) {
    for (const widget of section.widgets) {
      if (widget.type === 'links') {
        for (const link of widget.links) if (link.key) keys.push(link.key);
      } else if (widget.type === 'launcher') {
        for (const app of widget.apps) if (app.key) keys.push(app.key);
      }
    }
  }
  return keys;
}

export const DashboardConfigSchema = baseDashboardSchema
  .refine((config) => config.sections.every((s, i) => s.id === SECTION_IDS[i]), {
    message: `sections must appear in fixed order: ${SECTION_IDS.join(' → ')}`,
    path: ['sections'],
  })
  .refine(
    (config) => {
      const keys = collectShortcutKeys(config);
      return new Set(keys).size === keys.length;
    },
    {
      message: 'shortcut keys must be unique across all links and launcher widgets',
      path: ['sections'],
    },
  );

// === Types ===

export type LinksWidget = z.infer<typeof LinksWidgetSchema>;
export type LauncherWidget = z.infer<typeof LauncherWidgetSchema>;
export type HeadlinesWidget = z.infer<typeof HeadlinesWidgetSchema>;
export type WeatherWidget = z.infer<typeof WeatherWidgetSchema>;
export type ImageWidget = z.infer<typeof ImageWidgetSchema>;
export type TextWidget = z.infer<typeof TextWidgetSchema>;
export type Widget = z.infer<typeof WidgetSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;
