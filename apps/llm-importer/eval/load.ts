/**
 * Read a golden set off disk: `eval.config.yaml` → committed `{repo}.analysis.json`
 * artifacts (with `repository.path` re-pointed at the real source tree) →
 * `ground-truth.json`. No model, no network. Dev-only.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { RepoAnalysisSchema, type RepoAnalysis } from '../src/analysis/repo-analysis.schema.js';
import { EvalConfigSchema, WorkspaceGroundTruthSchema } from './schema.js';
import type { EvalConfig, WorkspaceGroundTruth } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_DIR = join(HERE, 'golden');

export interface LoadedGoldenSet {
  name: string;
  goldenDir: string;
  /** Absolute path to the directory holding the repo source trees. */
  workspaceDir: string;
  config: EvalConfig;
  groundTruth: WorkspaceGroundTruth;
  /** Committed analyses, `repository.path` patched to `<workspaceDir>/<repo.path>`. */
  analyses: RepoAnalysis[];
}

/** Golden-set names — every immediate subdir of `golden/` with an `eval.config.yaml`. */
export function listGoldenSets(): string[] {
  if (!existsSync(GOLDEN_DIR)) return [];
  return readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(GOLDEN_DIR, e.name, 'eval.config.yaml')))
    .map((e) => e.name)
    .sort();
}

/**
 * Where a set's `{repo}.analysis.json` files live: a local `analyses/` dir next
 * to the config when present (the `microservices-demo` convention — analyses
 * committed with the set), else `../analyses` relative to the source trees (the
 * `fixtures` convention — reuse `test/fixtures/analyses`, no duplication).
 */
function analysesDirFor(goldenDir: string, workspaceDir: string): string {
  const local = join(goldenDir, 'analyses');
  return existsSync(local) ? local : resolve(workspaceDir, '..', 'analyses');
}

export function loadGoldenSet(name: string): LoadedGoldenSet {
  const goldenDir = join(GOLDEN_DIR, name);
  if (!existsSync(goldenDir)) throw new Error(`no golden set "${name}" under ${GOLDEN_DIR}`);

  const config = EvalConfigSchema.parse(
    parseYaml(readFileSync(join(goldenDir, 'eval.config.yaml'), 'utf8'))
  );
  const workspaceDir = resolve(goldenDir, config.workspace.local);
  const groundTruth = WorkspaceGroundTruthSchema.parse(
    JSON.parse(readFileSync(join(goldenDir, 'ground-truth.json'), 'utf8'))
  );

  const analysesDir = analysesDirFor(goldenDir, workspaceDir);
  const analyses = config.repos.map((repo) => {
    const file = join(analysesDir, `${repo.name}.analysis.json`);
    if (!existsSync(file))
      throw new Error(`golden set "${name}": missing analysis artifact ${file}`);
    const analysis = RepoAnalysisSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    analysis.repository.path = join(workspaceDir, repo.path);
    return analysis;
  });

  return { name, goldenDir, workspaceDir, config, groundTruth, analyses };
}
