import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImportConfig } from '../config/config.schema.js';
import { ensureOutputDir, tryReadAnalysis } from './analysis-store.js';
import { toCorrelationGraph } from './to-correlation-graph.js';
import type { RepoAnalysis } from './repo-analysis.schema.js';
import type { RepoMeta } from '../review/review-file.js';
import type { RepositoryKnowledgeGraph } from '../graph/schema.js';
import { correlateDeterministically } from '../correlate/deterministic-correlator.js';
import { readExtraConnections } from '../correlate/extra-connections.js';
import { assembleReviewFile } from '../review/assemble-review.js';
import { buildDiagram } from '../export/diagram-builder.js';

/**
 * 010-harness-neutral-importer: the `import` command is deterministic and
 * model-free. It reads one `{repo}.analysis.json` per configured repository
 * (produced by an external analysis producer), runs the unchanged cross-repo
 * correlation, merges the optional `architecture.extra-connections.json`, and
 * writes the review artifact + diagram. No model call, no network request.
 */

export interface RunImportOptions {
  outputDirOverride?: string;
  repoNamesFilter?: string[];
  verbose: boolean;
}

function log(line: string): void {
  console.error(line);
}

function techLabel(analysis: RepoAnalysis): string {
  return (
    analysis.frameworks[0] ??
    (analysis.languages.length > 0 ? analysis.languages.join('/') : 'unknown')
  );
}

/** 008 US3: per-repo metadata carried onto the review artifact + diagram. */
function toRepoMeta(analysis: RepoAnalysis): RepoMeta {
  const tech = techLabel(analysis);
  return {
    name: analysis.repository.name,
    ...(analysis.description ? { description: analysis.description } : {}),
    ...(tech !== 'unknown' ? { technology: tech } : {}),
  };
}

function repoName(entry: ImportConfig['repositories'][number]): string {
  return entry.name ?? entry.path.split('/').filter(Boolean).pop() ?? entry.path;
}

export async function runImport(config: ImportConfig, options: RunImportOptions): Promise<void> {
  const outputDir = resolve(options.outputDirOverride ?? config.output.directory);
  await ensureOutputDir(outputDir);

  const selected = options.repoNamesFilter
    ? config.repositories.filter((r) => options.repoNamesFilter?.includes(r.name ?? r.path))
    : config.repositories;

  const graphs: RepositoryKnowledgeGraph[] = [];
  const analysesByName = new Map<string, RepoAnalysis>();

  for (const entry of selected) {
    const name = repoName(entry);
    const result = await tryReadAnalysis(outputDir, name);
    if (!result.ok) {
      const why =
        result.reason === 'missing'
          ? 'no analysis artifact'
          : `invalid analysis artifact — ${result.detail ?? 'schema mismatch'}`;
      log(`[skip] ${name}: ${why}`);
      continue;
    }
    analysesByName.set(result.analysis.repository.name, result.analysis);
    graphs.push(toCorrelationGraph(result.analysis));
    log(`[load] ${name}: ${techLabel(result.analysis)}`);
  }

  if (graphs.length === 0) {
    log(
      `\nNo valid analysis artifacts found in ${outputDir} — run a producer first ` +
        `(e.g. \`arch-atlas-import gather-context\` then \`@arch-atlas/analysis-runner-local\`, ` +
        `or the repo-analysis Claude Code skill). Nothing exported.`
    );
    return;
  }

  log(`\nCorrelating across ${graphs.length} repositories...`);
  const { connections, unresolvedPairs, passSummaries } = correlateDeterministically(graphs);
  for (const summary of passSummaries) log(`    ${summary}`);
  log(
    `  Deterministic pass: ${connections.length} connection(s) found, ${unresolvedPairs.length} pair(s) unresolved`
  );

  const extra = readExtraConnections(outputDir);
  if (extra.length > 0) log(`  extra-connections: ${extra.length} loaded`);

  const repoMetaByName = new Map(
    [...analysesByName.values()].map((a) => [a.repository.name, toRepoMeta(a)])
  );

  const review = assembleReviewFile(graphs, [...connections, ...extra], repoMetaByName);
  const reviewPath = join(outputDir, 'architecture.review.yaml');
  await writeFile(reviewPath, JSON.stringify(review, null, 2), 'utf8');
  log(`\n✓ Review artifact written to ${reviewPath}`);

  const diagramTitle =
    config.output.diagramFileName.replace(/\.arch\.json$/, '') || 'Imported Architecture';
  const diagram = buildDiagram(review, diagramTitle, repoMetaByName);
  const diagramPath = join(outputDir, config.output.diagramFileName);
  await writeFile(diagramPath, JSON.stringify(diagram, null, 2), 'utf8');
  log(`✓ Diagram written to ${diagramPath}`);
}
