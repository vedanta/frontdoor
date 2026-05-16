#!/usr/bin/env node
/**
 * One-shot migration: read design/reference/widgets/*.yml (the original Python
 * frontdoor's YAML manifests) → produce src/lib/config/default.ts as a typed,
 * Zod-validated DashboardConfig.
 *
 * Run via: `pnpm migrate:default-config`
 *
 * Idempotent — re-run any time the YAML reference changes. Output file carries
 * an AUTO-GENERATED banner; never edit by hand.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import {
  DashboardConfigSchema,
  type DashboardConfig,
  type Section,
  type SectionId,
  type Widget,
} from '../src/lib/config/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIDGETS_DIR = join(__dirname, '..', 'design', 'reference', 'widgets');
const OUTPUT_PATH = join(__dirname, '..', 'src', 'lib', 'config', 'default.ts');

type RawDashboard = {
  title: string;
  version: string;
  theme: string;
  grid: { columns: number };
  widgets: { file: string }[];
};

type RawWidget = Record<string, unknown>;

function readWidget(file: string): RawWidget {
  const content = readFileSync(join(WIDGETS_DIR, file), 'utf8');
  return parseYaml(content) as RawWidget;
}

/** `section-arrive.yml` → `'arrive'`; non-section files → null. */
function sectionIdFromFile(file: string): SectionId | null {
  const m = file.match(/^section-(arrive|act|reward|read|discover|depart)\.yml$/);
  return m ? (m[1] as SectionId) : null;
}

/**
 * Per-widget normalization:
 *   - `weather`: inject NYC fallback if lat/lon missing (MVP decision — see post-mvp.md A2).
 * All other widget shapes pass through; Zod fills in defaults on parse.
 */
function normalizeWidget(raw: RawWidget): unknown {
  if (raw.type === 'weather') {
    return {
      ...raw,
      lat: typeof raw.lat === 'number' ? raw.lat : 40.71,
      lon: typeof raw.lon === 'number' ? raw.lon : -74.01,
    };
  }
  return raw;
}

function buildConfig(): unknown {
  const dashboard = readWidget('dashboard.yml') as unknown as RawDashboard;

  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const entry of dashboard.widgets) {
    const widget = readWidget(entry.file);
    const sectionId = sectionIdFromFile(entry.file);

    if (sectionId) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        id: sectionId,
        title: String(widget.title ?? ''),
        ...(typeof widget.subtitle === 'string' ? { subtitle: widget.subtitle } : {}),
        widgets: [],
      };
    } else {
      if (!currentSection) {
        throw new Error(`Widget ${entry.file} appears before any section`);
      }
      currentSection.widgets.push(normalizeWidget(widget) as Widget);
    }
  }
  if (currentSection) sections.push(currentSection);

  return {
    title: dashboard.title,
    version: dashboard.version,
    grid: { columns: 4 },
    theme: 'dark',
    sections,
  };
}

function main(): void {
  // Discoverability check: list all YAMLs so a missing/extra file is loud.
  const allYamls = readdirSync(WIDGETS_DIR).filter((f) => f.endsWith('.yml'));
  console.log(`reading ${allYamls.length} YAML files from ${WIDGETS_DIR}`);

  const raw = buildConfig();

  const parsed = DashboardConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('✗ migration produced an invalid config:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }
  const config: DashboardConfig = parsed.data;

  const banner = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: design/reference/widgets/*.yml
 * Regenerate: \`pnpm migrate:default-config\`
 */`;
  const code = `${banner}

import type { DashboardConfig } from './schema';

export const DEFAULT_CONFIG: DashboardConfig = ${JSON.stringify(config, null, 2)};
`;

  writeFileSync(OUTPUT_PATH, code, 'utf8');

  const widgetCount = config.sections.reduce((sum, s) => sum + s.widgets.length, 0);
  console.log(`✓ wrote ${OUTPUT_PATH}`);
  console.log(`  ${config.sections.length} sections, ${widgetCount} widgets`);
  console.log(
    `  sections: ${config.sections.map((s) => `${s.id}(${s.widgets.length})`).join(' ')}`,
  );
}

main();
