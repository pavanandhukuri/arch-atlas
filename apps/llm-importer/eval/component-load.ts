/**
 * Read a golden-components set off disk: `eval.config.yaml` → the committed
 * `{repo}.components.json` artifact → `ground-truth.json`. No model, no
 * network. Dev-only. Mirrors `load.ts`, simplified for a one-repo set.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import {
  ComponentAnalysisSchema,
  type ComponentAnalysis,
} from '../src/analysis/component-analysis.schema.js';
import { ComponentEvalConfigSchema, ComponentGroundTruthSchema } from './component-schema.js';
import type { ComponentEvalConfig, ComponentGroundTruth } from './component-types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COMPONENT_GOLDEN_DIR = join(HERE, 'golden-components');

export interface LoadedComponentGoldenSet {
  name: string;
  goldenDir: string;
  config: ComponentEvalConfig;
  groundTruth: ComponentGroundTruth;
  artifact: ComponentAnalysis;
}

/** Golden-components set names — every immediate subdir with an `eval.config.yaml`. */
export function listComponentGoldenSets(): string[] {
  if (!existsSync(COMPONENT_GOLDEN_DIR)) return [];
  return readdirSync(COMPONENT_GOLDEN_DIR, { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && existsSync(join(COMPONENT_GOLDEN_DIR, e.name, 'eval.config.yaml'))
    )
    .map((e) => e.name)
    .sort();
}

export function loadComponentGoldenSet(name: string): LoadedComponentGoldenSet {
  const goldenDir = join(COMPONENT_GOLDEN_DIR, name);
  if (!existsSync(goldenDir))
    throw new Error(`no golden-components set "${name}" under ${COMPONENT_GOLDEN_DIR}`);

  const config = ComponentEvalConfigSchema.parse(
    parseYaml(readFileSync(join(goldenDir, 'eval.config.yaml'), 'utf8'))
  );
  const groundTruth = ComponentGroundTruthSchema.parse(
    JSON.parse(readFileSync(join(goldenDir, 'ground-truth.json'), 'utf8'))
  );

  const artifactPath = resolve(goldenDir, config.artifact);
  if (!existsSync(artifactPath))
    throw new Error(`golden-components set "${name}": missing artifact ${artifactPath}`);
  const artifact = ComponentAnalysisSchema.parse(JSON.parse(readFileSync(artifactPath, 'utf8')));

  return { name, goldenDir, config, groundTruth, artifact };
}
